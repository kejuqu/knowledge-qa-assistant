import { hasPermission } from "@kqa/auth/permissions";
import { getTenantUser } from "@/lib/tenant-user";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, modelSettings } from "@kqa/db";
import { getModelConfigForTenant } from "@/lib/model-config";

export async function GET() {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "settings.manage")) return NextResponse.json({ error: "没有管理模型配置的权限" }, { status: 403 });
  const config = await getModelConfigForTenant(user.tenantId);
  // apiKey 脱敏回显
  return NextResponse.json({
    ...config,
    llmApiKey: mask(config.llmApiKey),
    embeddingApiKey: mask(config.embeddingApiKey),
    role: user.role,
  });
}

export async function PUT(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // RBAC：模型配置是租户级资产，仅 admin 可改
  if (!hasPermission(user, "settings.manage")) {
    return NextResponse.json({ error: "没有管理模型配置的权限" }, { status: 403 });
  }

  const body = await request.json();
  // 脱敏值原样回传时不覆盖已存的 key
  const current = await getModelConfigForTenant(user.tenantId);
  const values = {
    tenantId: user.tenantId,
    llmBaseUrl: body.llmBaseUrl ?? current.llmBaseUrl,
    llmApiKey: unmask(body.llmApiKey, current.llmApiKey),
    llmModel: body.llmModel ?? current.llmModel,
    embeddingBaseUrl: body.embeddingBaseUrl ?? current.embeddingBaseUrl,
    embeddingApiKey: unmask(body.embeddingApiKey, current.embeddingApiKey),
    embeddingModel: body.embeddingModel ?? current.embeddingModel,
    updatedAt: new Date(),
  };

  await db
    .insert(modelSettings)
    .values(values)
    .onConflictDoUpdate({ target: modelSettings.tenantId, set: values });

  return NextResponse.json({ ok: true });
}

function mask(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function unmask(incoming: string | undefined, current: string) {
  if (incoming === undefined) return current;
  if (incoming.includes("****")) return current;
  return incoming;
}
