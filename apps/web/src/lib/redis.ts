import Redis from "ioredis";

/**
 * Redis 连接管理：Next.js dev 热更新时复用全局连接，避免重复连接。
 * 事件总线用 pub/sub 模式，支持多实例部署。Redis 的 Pub/Sub 是一种消息广播机制
 * pub/sub 模式: 是广播语义（一对多），消息不持久化，没人订阅时消息直接丢弃——和之前那个 List 队列的"点对点"语义完全不同。
 */
function createRedis() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, { maxRetriesPerRequest: null });
}

const globalForRedis = globalThis as unknown as {
  __kqaRedisPub?: Redis;
  __kqaRedisSub?: Redis;
  __kqaRedisQueue?: Redis;
};

// PUBLISH： 往某个 channel 发消息，谁订阅了谁就能收到。
// getRedisPub()：普通连接，用来 PUBLISH 消息。它也可以做别的普通命令
export function getRedisPub(): Redis {
  if (!globalForRedis.__kqaRedisPub) globalForRedis.__kqaRedisPub = createRedis();
  return globalForRedis.__kqaRedisPub;
}

// SUBSCRIBE： 订阅某个 channel，之后收到该 channel 的所有消息
// 专用订阅连接，只为订阅而生。它永远不执行普通命令，否则会报错
export function getRedisSub(): Redis {
  if (!globalForRedis.__kqaRedisSub) {
    globalForRedis.__kqaRedisSub = createRedis();
    // 订阅连接进入订阅模式后只能用于 subscribe/psubscribe
    globalForRedis.__kqaRedisSub.setMaxListeners(100);
  }
  return globalForRedis.__kqaRedisSub;
}

/** 队列消费用的独立连接（非订阅模式，可做 BLPOP 等阻塞操作） */
export function getRedisQueue(): Redis {
  if (!globalForRedis.__kqaRedisQueue) {
    globalForRedis.__kqaRedisQueue = createRedis();
  }
  return globalForRedis.__kqaRedisQueue;
}
