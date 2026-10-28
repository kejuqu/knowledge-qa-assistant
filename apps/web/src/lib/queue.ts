import { eq } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { ingestDocument } from "@kqa/ai";
import { getModelConfigForTenant } from "@/lib/model-config";
import { publish } from "@/lib/events";
import { getRedisQueue } from "@/lib/redis";

interface QueuedDocument {
  documentId: string;
  tenantId: string;
  filename: string;
  text: string;
}

/** Redis List 可靠队列：上传进程 LPUSH，消费进程 BLPOP 阻塞拉取，支持多实例并发消费 */
const QUEUE_KEY = "kqa:document:queue";

/** 消费进程注册表：key 为 `${tenantId}:${documentId}`，用于去重 */
const PROCESSING_REGISTRY_KEY = "kqa:document:processing";

const BLPOP_TIMEOUT_SECONDS = 5;
const REGISTRY_TTL_SECONDS = 30 * 60; // 30 分钟，防止僵尸任务永久占位

async function processItem(item: QueuedDocument) {
  const redis = getRedisQueue();
  const registryKey = `${item.tenantId}:${item.documentId}`;

  // 并发提审防重：只让拿到锁的进程处理
  const locked = await redis.set(
    `${PROCESSING_REGISTRY_KEY}:${registryKey}`,
    "1",
    "EX",
    REGISTRY_TTL_SECONDS,
    "NX"
  );
  if (!locked) return;

  try {
    const [doc] = await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, item.documentId))
      .returning();
    if (doc) {
      publish(item.tenantId, "document", {
        id: doc.id,
        status: doc.status,
        chunkCount: doc.chunkCount,
        error: doc.error,
      });
    }

    const config = await getModelConfigForTenant(item.tenantId);
    const chunkCount = await ingestDocument(
      {
        text: item.text,
        documentId: item.documentId,
        filename: item.filename,
        tenantId: item.tenantId,
      },
      config
    );

    const [updated] = await db
      .update(documents)
      .set({ status: "ready", chunkCount, error: null })
      .where(eq(documents.id, item.documentId))
      .returning();
    if (updated) {
      publish(item.tenantId, "document", {
        id: updated.id,
        status: updated.status,
        chunkCount: updated.chunkCount,
        error: updated.error,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    const [updated] = await db
      .update(documents)
      .set({ status: "failed", error: message })
      .where(eq(documents.id, item.documentId))
      .returning();
    if (updated) {
      publish(item.tenantId, "document", {
        id: updated.id,
        status: updated.status,
        chunkCount: updated.chunkCount,
        error: updated.error,
      });
    }
  } finally {
    await redis.del(`${PROCESSING_REGISTRY_KEY}:${registryKey}`);
  }
}

let consumerStarted = false;

/** 启动后台消费循环：每个 Node 进程只起一次 */
function ensureConsumer() {
  if (consumerStarted) return;
  consumerStarted = true;
  console.log("[queue] consumer started, waiting for jobs...");

  const redis = getRedisQueue();
  const loop = async () => {
    for (;;) {
      try {
        const result = await redis.blpop(QUEUE_KEY, BLPOP_TIMEOUT_SECONDS);
        if (result) {
          console.log(`[queue] job dequeued: ${result[1].slice(0, 80)}...`);
          const item = JSON.parse(result[1]) as QueuedDocument;
          await processItem(item);
          console.log(`[queue] job done: ${item.documentId}`);
        }
      } catch (err) {
        console.error("[queue] consumer error:", err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };
  // 不 await，后台常驻
  loop();
}

/** 入队文档处理任务；首次调用时启动本进程的消费循环 */
export async function enqueueDocument(item: QueuedDocument) {
  const redis = getRedisQueue();
  await redis.lpush(QUEUE_KEY, JSON.stringify(item));
  ensureConsumer();
}
