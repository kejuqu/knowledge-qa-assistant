import { and, desc, eq, isNull } from "drizzle-orm";
import { db, tenantApiKeys, tenants, tenantMembers } from "@kqa/db";
import { requireTeamManager, newApiKey, canImport } from "@/lib/team-api-key";
import { ImportError, readImportBody } from "@/lib/team-import-input";

const publicFields = {
  id: tenantApiKeys.id,
  name: tenantApiKeys.name,
  prefix: tenantApiKeys.prefix,
  createdAt: tenantApiKeys.createdAt,
  expiresAt: tenantApiKeys.expiresAt,
  lastUsedAt: tenantApiKeys.lastUsedAt,
  revokedAt: tenantApiKeys.revokedAt,
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handle(request?: Request) {
  try {
    const actor = await requireTeamManager();
    if (!request)
      return json({
        keys: await db
          .select(publicFields)
          .from(tenantApiKeys)
          .where(eq(tenantApiKeys.tenantId, actor.tenantId))
          .orderBy(desc(tenantApiKeys.createdAt)),
      });
    let body;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await readImportBody(request)),
      );
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError("无效的 JSON");
    }
    if (!body || typeof body !== "object") throw new ImportError("无效请求");
    return await db.transaction(async (tx) => {
      await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, actor.tenantId))
        .for("update");
      const [member] = await tx
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, actor.tenantId),
            eq(tenantMembers.userId, actor.sub),
          ),
        );
      if (!member || !canImport(member))
        throw new ImportError("团队管理权限已失效", 403);
      if (request.method === "POST") {
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.trim().length > 100
        )
          throw new ImportError("请输入 1–100 字的密钥名称");
        const current = await tx
          .select({ id: tenantApiKeys.id })
          .from(tenantApiKeys)
          .where(
            and(
              eq(tenantApiKeys.tenantId, actor.tenantId),
              isNull(tenantApiKeys.revokedAt),
            ),
          );
        if (current.length >= 20)
          throw new ImportError("最多保留 20 个未撤销的密钥，请先撤销旧密钥");
        const secret = newApiKey();
        const [key] = await tx
          .insert(tenantApiKeys)
          .values({
            tenantId: actor.tenantId,
            createdBy: actor.sub,
            name: body.name.trim(),
            keyHash: secret.keyHash,
            prefix: secret.prefix,
            expiresAt: new Date(Date.now() + 90 * 86400_000),
          })
          .returning(publicFields);
        return json({ ...key, key: secret.key }, 201);
      }
      if (
        typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          body.id,
        )
      )
        throw new ImportError("无效的密钥 ID");
      const [key] = await tx
        .update(tenantApiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(tenantApiKeys.id, body.id),
            eq(tenantApiKeys.tenantId, actor.tenantId),
            isNull(tenantApiKeys.revokedAt),
          ),
        )
        .returning({ id: tenantApiKeys.id });
      if (!key) throw new ImportError("密钥不存在或已撤销", 404);
      return json({ ok: true });
    });
  } catch (error) {
    if (error instanceof ImportError)
      return json({ error: error.message }, error.status);
    console.error(
      "Team API key operation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json({ error: "密钥操作失败，请重试" }, 500);
  }
}
export async function GET() {
  return handle();
}
export async function POST(request: Request) {
  return handle(request);
}
export async function DELETE(request: Request) {
  return handle(request);
}
