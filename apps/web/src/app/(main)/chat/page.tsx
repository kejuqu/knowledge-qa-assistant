"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { Button } from "@kqa/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@kqa/ui/components/input-group";
import { ArrowDown, ArrowUp, ArrowUpRight, Bot, Check, Copy, FileText, Plus, Sparkles, User as UserIcon } from "lucide-react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { CitationPanel, type CitationChunk } from "@/components/documents/document-preview";
import { formatMessageTime } from "@/lib/utils";
import { ModelSelector } from "@/components/chat/model-selector";
import { KnowledgeBaseSelector, type KnowledgeBaseDocument } from "@/components/chat/knowledge-base-selector";
import { usePermission } from "@/components/tenant-role";
import { ACCEPT_STRING, useDocumentUpload } from "@/components/documents/use-document-upload";
import { useChatStore } from "@/stores/chat-store";
import { useSidebar } from "@kqa/ui/components/sidebar";
import { cn } from "@kqa/ui/lib/utils";


interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  citations?: CitationChunk[] | null;
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

/** 点击引用来源时暂存的预览状态：整条消息的 citations + 选中的文档 */
interface ActiveCitation {
  citations: CitationChunk[];
  documentId: string;
}

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_WIDTH_STORAGE_KEY = "kqa.citation-panel-width";

function readStoredPanelWidth() {
  if (typeof window === "undefined") return PANEL_MAX_WIDTH;
  const saved = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
  return Number.isFinite(saved)
    ? Math.min(Math.max(saved, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH)
    : PANEL_MAX_WIDTH;
}

export default function ChatPage() {
  return <Suspense fallback={<ChatHistorySkeleton />}><ChatContent /></Suspense>;
}

function ChatContent() {
  const canUpload = usePermission("documents.upload");
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("id");
  const { setActiveConversation, streaming, setStreaming } =
    useChatStore();
  useEffect(() => { setActiveConversation(activeConversationId); }, [activeConversationId, setActiveConversation]);
  // 切换会话时收起文档预览面板
  useEffect(() => { setActiveCitations(null); }, [activeConversationId]);

  function openCitationPanel(citations: CitationChunk[], documentId: string) {
    setActiveCitations({ citations, documentId });
  }

  function handlePanelResize(clientX: number) {
    const next = Math.min(
      Math.max(window.innerWidth - clientX, PANEL_MIN_WIDTH),
      PANEL_MAX_WIDTH
    );
    setPanelWidth(Math.round(next));
  }

  function handlePanelResizeEnd() {
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    } catch {
      // localStorage 不可用时忽略
    }
  }
  const [input, setInput] = useState("");
  const [liveAnswer, setLiveAnswer] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [activeCitations, setActiveCitations] = useState<ActiveCitation | null>(null);
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { upload, tasks: uploadTasks, error: uploadError } = useDocumentUpload();

  useEffect(() => {
    let animationFrame = 0;
    const focusInput = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => inputRef.current?.focus());
    };

    window.addEventListener("kqa:new-conversation", focusInput);
    if (!activeConversationId) focusInput();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("kqa:new-conversation", focusInput);
    };
  }, [activeConversationId]);

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
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageScroller.Provider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <MessageScroller.Viewport
            id="chat-messages"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-10"
            aria-label="问答消息"
          >
            <MessageScroller.Content className="mx-auto flex w-full max-w-3xl flex-col gap-7" aria-busy={streaming}>
              {historyError && <p role="alert" className="text-center text-sm text-destructive">无法加载对话，可能已被删除或暂时不可用。</p>}
              {/* 骨架屏只在没有其他内容可展示时出现，避免新会话首条消息回复期间闪烁 */}
              {isHistoryLoading && !hasVisibleMessages && !streaming && (
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
                  <MessageBubble message={message} onPreviewCitations={openCitationPanel} />
                </MessageScroller.Item>
              ))}
              {visiblePendingMessages.map((message) => (
                <MessageScroller.Item key={message.id} messageId={message.id} scrollAnchor>
                  <MessageBubble message={message} onPreviewCitations={openCitationPanel} />
                </MessageScroller.Item>
              ))}
              {streaming && (
                <MessageScroller.Item messageId="live-answer">
                  <div className="animate-in fade-in-0 duration-300">
                    <MessageBubble
                      message={{ id: "live", role: "assistant", content: liveAnswer }}
                      onPreviewCitations={openCitationPanel}
                    />
                  </div>
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
              {canUpload && <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_STRING}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />}
              <InputGroup className="chat-composer h-36 gap-2 rounded-3xl border-0 p-4">
                <InputGroupTextarea
                  ref={inputRef}
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
                  {canUpload && <TooltipHint content="上传知识库">
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
                  </TooltipHint>}
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
                  <TooltipHint content={streaming ? "正在生成回复，请稍候" : !input.trim() ? "请输入文本" : "发送消息 · Enter 发送，Shift+Enter 换行"}>
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

        {activeCitations && (
          <>
            <PanelResizeHandle onResize={handlePanelResize} onResizeEnd={handlePanelResizeEnd} />
            <CitationPanel
              citations={activeCitations.citations}
              initialDocumentId={activeCitations.documentId}
              width={panelWidth}
              onClose={() => setActiveCitations(null)}
            />
          </>
        )}
      </div>
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
          window.dispatchEvent(new Event("kqa:new-conversation"));
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

function MessageBubble({
  message,
  onPreviewCitations,
}: {
  message: Message;
  onPreviewCitations: (citations: CitationChunk[], documentId: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message.content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`group/message flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-card text-primary shadow-sm"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`min-w-0 rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
            isUser
              ? "rounded-tr-md bg-primary text-primary-foreground"
              : "rounded-tl-md bg-card text-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : message.content ? (
            <MessageMarkdown content={message.content} />
          ) : (
            <ThinkingIndicator />
          )}
          {message.citations && message.citations.length > 0 && (
            <CitationPreview citations={message.citations} onSelect={onPreviewCitations} />
          )}
        </div>
        {message.id !== "live" && (
          <div className="mt-1 flex items-center gap-1.5 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100">
            {message.createdAt && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {formatMessageTime(message.createdAt)}
              </span>
            )}
            <TooltipHint content={copied ? "已复制" : "复制消息"}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-lg text-muted-foreground"
                onClick={() => void copyMessage()}
                aria-label={copied ? "消息已复制" : "复制消息"}
              >
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              </Button>
            </TooltipHint>
          </div>
        )}
      </div>
    </div>
  );
}

/** 消息气泡里的引用来源列表：点击后在右侧预览面板打开对应文档。 */
/** AI 思考中指示器：三点错峰弹跳，动画只动 transform/opacity，尊重减弱动效偏好。 */
function ThinkingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" role="status" aria-label="正在思考">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="thinking-dot size-1.5 rounded-full bg-foreground/70"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  );
}

function CitationPreview({
  citations,
  onSelect,
}: {
  citations: CitationChunk[];
  onSelect: (citations: CitationChunk[], documentId: string) => void;
}) {
  // 引用按钮按文档去重；完整 citations 交给预览面板，面板内可切换文档
  const documentButtons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const citation of citations) {
      if (!seen.has(citation.documentId)) seen.set(citation.documentId, citation.filename);
    }
    return [...seen.entries()].map(([documentId, filename]) => ({ documentId, filename }));
  }, [citations]);

  return (
    <div className="mt-2 flex flex-col items-start gap-1 pt-2 text-xs opacity-80">
      <p className="font-medium">引用来源：</p>
      {documentButtons.map(({ documentId, filename }) => (
        <button
          key={documentId}
          type="button"
          className="group/citation inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onSelect(citations, documentId)}
          title="预览引用文档"
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{filename}</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/citation:opacity-100 group-focus-visible/citation:opacity-100 [@media(hover:none)]:opacity-100" />
        </button>
      ))}
    </div>
  );
}

/**
 * 聊天区与文档预览面板之间的拖拽手柄。
 * hover 显示拖拽光标与细线高亮；拖拽期间通过 html[data-panel-resizing]
 * 让侧栏右缘联动高亮、全局切换 col-resize 光标并禁止文本选中（见 globals.css）。
 */
function PanelResizeHandle({
  onResize,
  onResizeEnd,
}: {
  onResize: (clientX: number) => void;
  onResizeEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    document.documentElement.setAttribute("data-panel-resizing", "true");
    return () => document.documentElement.removeAttribute("data-panel-resizing");
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整文档预览宽度"
      className={cn(
        "group/handle relative hidden w-2 shrink-0 cursor-col-resize touch-none transition-colors md:block",
        "hover:bg-primary/10",
        dragging && "bg-primary/20"
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (dragging) onResize(event.clientX);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDragging(false);
        onResizeEnd();
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/handle:bg-primary/50",
          dragging && "bg-primary/60"
        )}
      />
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
