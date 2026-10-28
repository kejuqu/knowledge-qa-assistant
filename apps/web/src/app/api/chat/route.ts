import { NextResponse } from "next/server";
import { db, conversations, messages } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";
import { streamRagAnswer } from "@kqa/ai";
import { getModelConfigForTenant } from "@/lib/model-config";

/**
 * POST /api/chat
 * body: { conversationId?: string, message: string }
 * 响应：text/plain 流（首个 chunk 前先发一行 JSON 元信息：conversationId + citations）
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { conversationId, message } = await request.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // 没有会话就新建，标题取问题前 20 字
  let convId = conversationId as string | undefined;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ ownerId: user.sub, title: message.slice(0, 20) })
      .returning();
    convId = conv.id;
  }

  await db.insert(messages).values({ conversationId: convId, role: "user", content: message });

  const config = await getModelConfigForTenant(user.tenantId);
  const { stream, citations } = await streamRagAnswer(message, user.tenantId, config);

  const metaLine = JSON.stringify({ conversationId: convId, citations }) + "\n";
  const encoder = new TextEncoder();
  const finalConvId = convId;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(metaLine));
      let full = "";
      try {
        for await (const chunk of stream) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // 流结束后把完整回答落库
        await db.insert(messages).values({
          conversationId: finalConvId,
          role: "assistant",
          content: full,
          citations,
        });
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
