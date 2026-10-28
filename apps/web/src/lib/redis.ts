import Redis from "ioredis";

/**
 * Redis 连接管理：Next.js dev 热更新时复用全局连接，避免重复连接。
 * 事件总线用 pub/sub 模式，支持多实例部署。
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

export function getRedisPub(): Redis {
  if (!globalForRedis.__kqaRedisPub) globalForRedis.__kqaRedisPub = createRedis();
  return globalForRedis.__kqaRedisPub;
}

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
