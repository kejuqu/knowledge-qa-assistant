"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Textarea } from "@kqa/ui/components/textarea";
import { Send, Bot, User as UserIcon, FileText, Plus } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ documentId: string; filename: string }> | null;
}

interface Conversation {
  id: string;
  title: string;
}

export default function ChatPage() {
  const { activeConversationId, setActiveConversation, streaming, setStreaming } =
    useChatStore();
  const [input, setInput] = useState("");
  const [liveAnswer, setLiveAnswer] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => fetch("/api/conversations").then((r) => r.json()),
  });

  const { data: history = [] } = useQuery<Message[]>({
    queryKey: ["messages", activeConversationId],
    queryFn: () =>
      fetch(`/api/conversations/${activeConversationId}/messages`).then((r) => r.json()),
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, liveAnswer]);

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    setLiveAnswer("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeConversationId, message }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let metaParsed = false;
    let answer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 第一个换行符之前是服务端发的 JSON 元信息（conversationId + citations）
      if (!metaParsed) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) continue; // 元信息还没收完，继续读
        const meta = JSON.parse(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        metaParsed = true;
        if (!activeConversationId) setActiveConversation(meta.conversationId);
      }
      if (buffer) {
        answer += buffer;
        buffer = "";
        setLiveAnswer(answer);
      }
    }
    setStreaming(false);
    setLiveAnswer("");
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["messages"] });
  }

  return (
    <div className="flex h-screen">
      {/* 会话列表 */}
      <div className="w-56 border-r p-3">
        <Button
          variant="outline"
          size="sm"
          className="mb-3 w-full justify-start gap-2"
          onClick={() => setActiveConversation(null)}
        >
          <Plus className="size-4" /> 新对话
        </Button>
        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConversation(c.id)}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                c.id === activeConversationId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {history.length === 0 && !streaming && (
              <p className="pt-24 text-center text-muted-foreground">
                上传文档到知识库后，开始提问吧
              </p>
            )}
            {history.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streaming && (
              <MessageBubble
                message={{ id: "live", role: "assistant", content: liveAnswer }}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
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
              className="min-h-11 resize-none"
            />
            <Button onClick={send} disabled={streaming || !input.trim()} size="icon">
              <Send />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-6 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
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
