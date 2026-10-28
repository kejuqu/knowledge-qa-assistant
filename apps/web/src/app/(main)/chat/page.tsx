"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Textarea } from "@kqa/ui/components/textarea";
import { Send, Bot, User as UserIcon, FileText, Sparkles } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  citations?: Array<{ documentId: string; filename: string }> | null;
}

interface PendingMessage {
  id: string;
  role: "user";
  content: string;
  conversationId: string | null;
  serverMessageId?: string;
}

export default function ChatPage() {
  const { activeConversationId, setActiveConversation, streaming, setStreaming } =
    useChatStore();
  const [input, setInput] = useState("");
  const [liveAnswer, setLiveAnswer] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: history = [] } = useQuery<Message[]>({
    queryKey: ["messages", activeConversationId],
    queryFn: () =>
      fetch(`/api/conversations/${activeConversationId}/messages`).then((r) => r.json()),
    enabled: !!activeConversationId,
  });

  // 同一条用户消息一旦已从服务端历史中读到，就用服务端版本替换本地占位，避免重复。
  const visibleHistory = useMemo(
    () =>
      history.filter(
        (message) => !pendingMessages.some((pending) => pending.serverMessageId === message.id)
      ),
    [history, pendingMessages]
  );
  const visiblePendingMessages = pendingMessages.filter(
    (pending) => !pending.conversationId || pending.conversationId === activeConversationId
  );
  const hasVisibleMessages = visibleHistory.length > 0 || visiblePendingMessages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleHistory.length, visiblePendingMessages.length, liveAnswer]);

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    const pendingId = `pending-${crypto.randomUUID()}`;
    const requestConversationId = activeConversationId;
    setInput("");
    setSendError("");
    // 立即显示用户气泡，不能等待会话创建、RAG 检索或首个流式 chunk。
    setPendingMessages((current) => [
      ...current,
      { id: pendingId, role: "user", content: message, conversationId: requestConversationId },
    ]);
    setStreaming(true);
    setLiveAnswer("");

    let resolvedConversationId = requestConversationId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: requestConversationId, message }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "发送失败，请稍后重试");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let metaParsed = false;
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 第一个换行符之前是服务端发的 JSON 元信息（conversationId + citations）。
        if (!metaParsed) {
          const idx = buffer.indexOf("\n");
          if (idx === -1) continue;
          const meta = JSON.parse(buffer.slice(0, idx)) as {
            conversationId: string;
            userMessageId: string;
          };
          buffer = buffer.slice(idx + 1);
          metaParsed = true;
          resolvedConversationId = meta.conversationId;
          setPendingMessages((current) =>
            current.map((pending) =>
              pending.id === pendingId
                ? {
                    ...pending,
                    conversationId: meta.conversationId,
                    serverMessageId: meta.userMessageId,
                  }
                : pending
            )
          );
          if (!requestConversationId) setActiveConversation(meta.conversationId);
        }
        if (buffer) {
          answer += buffer;
          buffer = "";
          setLiveAnswer(answer);
        }
      }

      if (resolvedConversationId) {
        // 等历史记录已落库并重新取得后再移除占位，消息区不会在请求末尾闪空。
        await queryClient.invalidateQueries({
          queryKey: ["messages", resolvedConversationId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setPendingMessages((current) => current.filter((pending) => pending.id !== pendingId));
    } catch (error) {
      setPendingMessages((current) => current.filter((pending) => pending.id !== pendingId));
      setSendError(error instanceof Error ? error.message : "发送失败，请稍后重试");
    } finally {
      setStreaming(false);
      setLiveAnswer("");
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 消息区 */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-3xl space-y-7">
            {!hasVisibleMessages && !streaming && (
              <div className="flex min-h-[50vh] flex-col items-center justify-center pb-20 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-emerald-700/10 bg-white/65 text-primary shadow-[0_18px_40px_-26px_rgba(13,109,76,0.6)] backdrop-blur">
                  <Sparkles className="size-5" />
                </div>
                <p className="text-base font-medium text-emerald-950/80">从知识库开始一场对话</p>
                <p className="mt-1.5 text-sm text-muted-foreground">上传文档后，向我提问即可获得基于资料的回答</p>
              </div>
            )}
            {visibleHistory.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {visiblePendingMessages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streaming && (
              <MessageBubble
                message={{ id: "live", role: "assistant", content: liveAnswer || "正在思考…" }}
              />
            )}
            {sendError && <p className="text-center text-sm text-destructive">{sendError}</p>}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-emerald-950/10 bg-white/30 px-6 py-4 backdrop-blur-xl sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-emerald-700/15 bg-white/75 p-1.5 shadow-[0_16px_36px_-24px_rgba(10,92,63,0.6)] transition-all duration-200 focus-within:border-emerald-600/30 focus-within:bg-white/90 focus-within:shadow-[0_18px_40px_-22px_rgba(10,119,80,0.42)]">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                className="min-h-11 max-h-36 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
              />
              <Button
                onClick={send}
                disabled={streaming || !input.trim()}
                size="icon"
                className="mb-0.5 size-10 shrink-0 rounded-xl shadow-[0_8px_18px_-10px_rgba(8,113,76,0.8)]"
                aria-label="发送消息"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <p className="px-2 pt-2 text-[11px] text-muted-foreground/80">Enter 发送 · Shift + Enter 换行</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground shadow-[0_8px_18px_-11px_rgba(7,111,74,0.9)]"
            : "border border-emerald-950/8 bg-white/65 text-primary shadow-[0_8px_20px_-15px_rgba(14,88,61,0.35)]"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-[0_12px_28px_-22px_rgba(15,91,64,0.55)] ${
          isUser
            ? "rounded-tr-md bg-primary text-primary-foreground"
            : "rounded-tl-md border border-emerald-950/8 bg-white/70 text-foreground backdrop-blur-sm"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 border-t border-border/50 pt-2 text-xs opacity-80">
            <p className="mb-1 font-medium">引用来源：</p>
            {message.citations.map((c, i) => (
              <span key={i} className="mr-2 inline-flex items-center gap-1">
                <FileText className="size-3" />
                {c.filename}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
