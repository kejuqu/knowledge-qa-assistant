import { and, eq, isNull } from "drizzle-orm";
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

// 处理消费任务
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
      .where(and(
        eq(documents.id, item.documentId),
        eq(documents.tenantId, item.tenantId),
        eq(documents.status, "pending"),
        isNull(documents.deletedAt),
      ))
      .returning();
    if (!doc) return;
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

// SET NX：Redis 命令，SET key value NX —— 只有 key 不存在的时候才设置成功，天然用来做分布式锁
// 分布式锁防重：同一个文档，可能因为重试、前端重复提交、多次推送，多次塞进队列；我们只希望只执行一次
// TTL 30 分钟防僵尸锁：锁自带过期时间。如果任务跑崩、进程挂了、代码卡死，没人主动释放锁，30 分钟后锁自动消失，避免锁永远占着，任务彻底卡死（僵尸锁）
/** 启动后台消费循环：每个 Node 进程只起一次 */
function ensureConsumer() {
  if (consumerStarted) return;
  consumerStarted = true;
  console.log("[queue] consumer started, waiting for jobs...");

  const redis = getRedisQueue();
  const loop = async () => {
    for (;;) {
      try {
        // BLPOP key timeout 会一直阻塞到队列有元素，或者超时（BLPOP_TIMEOUT_SECONDS 秒）。
        // 如果返回 null 表示超时，此时 if (result) 为假，循环继续下一轮
        const result = await redis.blpop(QUEUE_KEY, BLPOP_TIMEOUT_SECONDS);
        if (result) {
          // BLPOP 返回 [key, value] 数组，result[0] 是 key，result[1] 是弹出值。
          // .slice(0, 80) 只是打日志时截断，避免日志爆炸
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
  // 不 await，后台常驻，不阻塞调用方
  loop();
}

/** 入队文档处理任务；首次调用时启动本进程的消费循环 */
export async function enqueueDocument(item: QueuedDocument) {
  const redis = getRedisQueue();
  await redis.lpush(QUEUE_KEY, JSON.stringify(item));
  // 这个"单例"只在单进程内有效。多进程 / 多实例部署时，每个进程都会各起一个消费者——这是可以的，
  // 因为 Redis List 本身支持多个消费者竞争式消费（每个 BLPOP 拿到的元素不会重复分给其他消费者）
  ensureConsumer();
}
