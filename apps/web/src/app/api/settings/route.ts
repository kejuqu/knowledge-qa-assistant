import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, modelSettings } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";
import { getModelConfigForUser } from "@/lib/model-config";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const config = await getModelConfigForUser(user.sub);
  // apiKey 脱敏回显
  return NextResponse.json({
    ...config,
    llmApiKey: mask(config.llmApiKey),
    embeddingApiKey: mask(config.embeddingApiKey),
  });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  // 脱敏值原样回传时不覆盖已存的 key
  const current = await getModelConfigForUser(user.sub);
  const values = {
    ownerId: user.sub,
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
    .onConflictDoUpdate({ target: modelSettings.ownerId, set: values });

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
