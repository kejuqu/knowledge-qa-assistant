import { getTenantUser } from "@/lib/tenant-user";
import { db, documents } from "@kqa/db";
import { eq } from "drizzle-orm";
import { subscribe } from "@/lib/events";

/**
 * SSE 端点：推送本租户内文档处理状态变更。
 * 连接建立时补发一次全量快照，之后增量推送单条变更；断开时自动取消订阅。
 */
export async function GET() {
  const user = await getTenantUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("connected", { tenantId: user.tenantId, ts: Date.now() });

      const snapshot = await db
        .select()
        .from(documents)
        .where(eq(documents.tenantId, user.tenantId));
      send("snapshot", snapshot);

      // Redis pub/sub 订阅（跨进程/跨实例）
      unsubscribe = await subscribe(user.tenantId, ({ event, payload }) => {
        send(event, payload);
      });

      heartbeat = setInterval(() => send("ping", { ts: Date.now() }), 30_000);
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
