import { getRedisPub, getRedisSub } from "./redis";

/**
 * Redis pub/sub 事件总线：SSE 推送的跨进程/跨实例通道。
 * 上传进程 publish，SSE 路由所在的任意实例 subscribe 后推给浏览器。
 */
const TENANT_CHANNEL_PREFIX = "kqa:events:tenant:";

export interface EventMessage {
  event: string;
  payload: unknown;
}

export async function subscribe(
  tenantId: string,
  listener: (message: EventMessage) => void
): Promise<() => void> {
  const sub = getRedisSub();
  const channel = `${TENANT_CHANNEL_PREFIX}${tenantId}`;

  const handler = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      const { event, payload } = JSON.parse(message);
      listener({ event, payload });
    } catch {
      // 非 JSON 消息忽略
    }
  };

  sub.on("message", handler);
  await sub.subscribe(channel);

  return () => {
    sub.off("message", handler);
    sub.unsubscribe(channel).catch(() => {});
  };
}

export async function publish(tenantId: string, event: string, payload: unknown) {
  const pub = getRedisPub();
  await pub.publish(
    `${TENANT_CHANNEL_PREFIX}${tenantId}`,
    JSON.stringify({ event, payload })
  );
}
