"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { Skeleton } from "@kqa/ui/components/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@kqa/ui/components/input-group";
import { ArrowDown, ArrowUp, Bot, FileText, Plus, Sparkles, User as UserIcon } from "lucide-react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { ModelSelector } from "@/components/chat/model-selector";
import { KnowledgeBaseSelector, type KnowledgeBaseDocument } from "@/components/chat/knowledge-base-selector";
import { ACCEPT_STRING, useDocumentUpload } from "@/components/documents/use-document-upload";
import { useChatStore } from "@/stores/chat-store";
import { useSidebar } from "@kqa/ui/components/sidebar";

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

interface ModelSettings {
  llmModel: string;
}

export default function ChatPage() {
  return <Suspense fallback={<ChatHistorySkeleton />}><ChatContent /></Suspense>;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("id");
  const { setActiveConversation, streaming, setStreaming } =
    useChatStore();
  useEffect(() => { setActiveConversation(activeConversationId); }, [activeConversationId, setActiveConversation]);
  const [input, setInput] = useState("");
  const [liveAnswer, setLiveAnswer] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { upload, tasks: uploadTasks, error: uploadError } = useDocumentUpload();

  const { data: modelSettings } = useQuery<ModelSettings>({
    queryKey: ["chat-model"],
    queryFn: () => fetch("/api/settings").then((response) => response.json()),
  });

  const { data: knowledgeBaseDocuments = [] } = useQuery<KnowledgeBaseDocument[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((response) => response.json()),
  });

  const availableModels = useMemo(
    () => [{ value: modelSettings?.llmModel || "default", label: modelSettings?.llmModel || "默认模型" }],
    [modelSettings?.llmModel]
  );
  const activeModel = selectedModel || availableModels[0].value;

  const { data: history = [], isLoading: isHistoryLoading, error: historyError } = useQuery<Message[]>({
    queryKey: ["messages", activeConversationId],
    queryFn: () =>
      fetch(`/api/conversations/${activeConversationId}/messages`).then(async (r) => {
        if (!r.ok) throw new Error("加载对话失败");
        return r.json();
      }),
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

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    const pendingId = `pending-${createPendingMessageId()}`;
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
        body: JSON.stringify({
          conversationId: requestConversationId,
          message,
          documentIds: selectedKnowledgeBaseIds,
        }),
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
          if (!requestConversationId) {
            window.history.replaceState(null, "", `/chat?id=${encodeURIComponent(meta.conversationId)}`);
            setActiveConversation(meta.conversationId);
          }
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
    <div className="chat-page flex h-[calc(100dvh-4rem)] flex-col overflow-hidden md:h-dvh">
      <MobileNewConversationButton />
      <MessageScroller.Provider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <MessageScroller.Viewport
            id="chat-messages"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-10"
            aria-label="问答消息"
          >
            <MessageScroller.Content className="mx-auto flex w-full max-w-3xl flex-col gap-7" aria-busy={streaming}>
              {historyError && <p role="alert" className="text-center text-sm text-destructive">无法加载对话，可能已被删除或暂时不可用。</p>}
              {isHistoryLoading && (
                <MessageScroller.Item messageId="history-loading">
                  <ChatHistorySkeleton />
                </MessageScroller.Item>
              )}
              {!historyError && !isHistoryLoading && !hasVisibleMessages && !streaming && (
                <MessageScroller.Item messageId="empty-state">
                  <div className="flex min-h-[50vh] flex-col items-center justify-center pb-20 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
                  <Sparkles className="size-5" />
                </div>
                <p className="text-base font-medium text-foreground">从知识库开始一场对话</p>
                <p className="mt-1.5 text-sm text-muted-foreground">上传文档后，向我提问即可获得基于资料的回答</p>
                  </div>
                </MessageScroller.Item>
              )}
              {!isHistoryLoading && visibleHistory.map((message) => (
                <MessageScroller.Item
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <MessageBubble message={message} />
                </MessageScroller.Item>
              ))}
              {visiblePendingMessages.map((message) => (
                <MessageScroller.Item key={message.id} messageId={message.id} scrollAnchor>
                  <MessageBubble message={message} />
                </MessageScroller.Item>
              ))}
              {streaming && (
                <MessageScroller.Item messageId="live-answer">
                  <MessageBubble
                    message={{ id: "live", role: "assistant", content: liveAnswer || "正在思考…" }}
                  />
                </MessageScroller.Item>
              )}
              {sendError && (
                <MessageScroller.Item messageId="send-error">
                  <p className="text-center text-sm text-destructive">{sendError}</p>
                </MessageScroller.Item>
              )}
            </MessageScroller.Content>
          </MessageScroller.Viewport>
          <MessageScroller.Button className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-medium shadow-sm inert:hidden">
            <ArrowDown className="size-3" />
            回到最新消息
          </MessageScroller.Button>
        </MessageScroller.Root>

        <div className="shrink-0 px-4 pb-5 pt-3 sm:px-10 sm:pb-6">
          <div className="mx-auto w-full max-w-3xl">
            <form
              ref={formRef}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_STRING}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
              <InputGroup className="chat-composer h-36 gap-2 rounded-3xl border-0 p-4">
                <InputGroupTextarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  placeholder="输入问题…"
                  aria-label="输入问题"
                  className="chat-composer-input min-h-0 p-0"
                />
                <InputGroupAddon align="block-end" className="gap-3 p-0">
                  <TooltipHint content="上传知识库">
                    <span className="inline-flex shrink-0" tabIndex={uploadTasks.length > 0 ? 0 : undefined}>
                      <InputGroupButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="chat-composer-upload size-10 shrink-0 rounded-full"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadTasks.length > 0}
                        aria-label="上传知识库文档"
                      >
                        <Plus data-icon="inline-start" />
                      </InputGroupButton>
                    </span>
                  </TooltipHint>
                  <div className="ml-auto min-w-0">
                    <KnowledgeBaseSelector
                      documents={knowledgeBaseDocuments}
                      selectedIds={selectedKnowledgeBaseIds}
                      onSelectedIdsChange={setSelectedKnowledgeBaseIds}
                      disabled={streaming}
                    />
                  </div>
                  <div className="min-w-0">
                    <ModelSelector
                      models={availableModels}
                      value={activeModel}
                      onValueChange={setSelectedModel}
                      disabled={streaming}
                    />
                  </div>
                  <TooltipHint content="发送消息 · Enter 发送，Shift+Enter 换行">
                    <span className="inline-flex shrink-0" tabIndex={streaming || !input.trim() ? 0 : undefined}>
                      <InputGroupButton
                        type="submit"
                        variant="default"
                        disabled={streaming || !input.trim()}
                        size="icon-sm"
                        className="chat-composer-send size-10 shrink-0 rounded-full shadow-none"
                        aria-label="发送消息"
                        aria-keyshortcuts="Enter"
                      >
                        <ArrowUp data-icon="inline-start" />
                      </InputGroupButton>
                    </span>
                  </TooltipHint>
                </InputGroupAddon>
              </InputGroup>
            </form>
            {(uploadTasks[0] || uploadError) && (
              <p className={uploadError ? "px-2 pt-1 text-xs text-destructive" : "px-2 pt-1 text-xs text-muted-foreground"}>
                {uploadError || `正在上传知识库文档：${uploadTasks[0].name}`}
              </p>
            )}
          </div>
        </div>
      </MessageScroller.Provider>
    </div>
  );
}

function MobileNewConversationButton() {
  const router = useRouter();
  const { isMobile, mobileOpen } = useSidebar();
  const { setActiveConversation, streaming } = useChatStore();

  if (!isMobile || mobileOpen) return null;

  return (
    <TooltipHint content="新建对话" side="bottom">
      <button
        type="button"
        className="fixed right-3 top-3 z-30 flex size-10 items-center justify-center rounded-xl bg-card text-foreground shadow-md transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={streaming}
        onClick={() => {
          setActiveConversation(null);
          router.push("/chat");
        }}
        aria-label="新建对话"
      >
        <Plus className="size-5" />
      </button>
    </TooltipHint>
  );
}

function createPendingMessageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  // 仅用于浏览器内的乐观消息占位；服务端消息仍使用数据库生成的 UUID。
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-card text-primary shadow-sm"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`min-w-0 max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "rounded-tr-md bg-primary text-primary-foreground"
            : "rounded-tl-md bg-card text-foreground"
        }`}
      >
        {isUser ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : <MessageMarkdown content={message.content} />}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 text-xs opacity-80">
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

function ChatHistorySkeleton() {
  const rows = ["user-one", "assistant-one", "user-two", "assistant-two", "user-three"] as const;

  return (
    <div className="flex flex-col gap-7" aria-label="正在加载消息" role="status">
      {rows.map((row, index) => {
        const isUser = index % 2 === 0;
        return (
          <div key={row} className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className={`flex flex-col gap-2 rounded-2xl p-4 ${isUser ? "w-2/5 rounded-tr-md" : "w-3/5 rounded-tl-md bg-card"}`}>
              <Skeleton className="h-4 w-full" />
              {!isUser && <Skeleton className="h-4 w-3/5" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
