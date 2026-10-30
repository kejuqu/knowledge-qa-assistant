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

// 订阅方通过 subscribe(tenantId, listener) 接收，返回一个"取消订阅"函数
export async function subscribe(
  tenantId: string,
  listener: (message: EventMessage) => void
): Promise<() => void> {
  const sub = getRedisSub();
  // 频道命名
  const channel = `${TENANT_CHANNEL_PREFIX}${tenantId}`;

  const handler = (ch: string, message: string) => {
    // 按频道过滤
    if (ch !== channel) return;
    try {
      const { event, payload } = JSON.parse(message);
      // 解包后回调业务
      listener({ event, payload });
    } catch {
      // 非 JSON 消息忽略
    }
  };

  // 先挂监听 message 消息
  sub.on("message", handler);
  // 再真正订阅
  await sub.subscribe(channel);

  // 返回取消函数
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
