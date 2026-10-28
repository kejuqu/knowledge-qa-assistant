import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://kqa:kqa_password@localhost:5432/kqa";

// Next.js dev 热更新时避免重复创建连接池
const globalForDb = globalThis as unknown as { __kqaSql?: postgres.Sql };

const sql = globalForDb.__kqaSql ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__kqaSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
