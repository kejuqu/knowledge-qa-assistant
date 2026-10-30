"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kqa/ui/components/tabs";
import { Download, FileText, X } from "lucide-react";
import { cn } from "@kqa/ui/lib/utils";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { buildHighlightSegments, injectHighlightsIntoHtml } from "@/lib/highlight";

export interface CitationChunk {
  documentId: string;
  filename: string;
  chunkIndex: number;
  /** 召回段落原文（旧消息可能缺失） */
  content?: string;
  /** COSINE 相似度，越高越相关（旧消息可能缺失） */
  score?: number;
}


/** 右侧文档预览面板：引用段落（Markdown）+ 原文件双 Tab，宽度由拖拽手柄调整。 */
export function CitationPanel({
  citations,
  initialDocumentId,
  width,
  onClose,
  floating = false,
  loading = false,
  error,
}: {
  citations: CitationChunk[];
  initialDocumentId: string;
  width: number;
  onClose: () => void;
  floating?: boolean;
  loading?: boolean;
  error?: string;
}) {
  const documentButtons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const citation of citations) {
      if (!seen.has(citation.documentId)) seen.set(citation.documentId, citation.filename);
    }
    return [...seen.entries()].map(([documentId, filename]) => ({ documentId, filename }));
  }, [citations]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(initialDocumentId);
  // 关闭时先播退出动画，再通知父级卸载
  const [exiting, setExiting] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function requestClose() {
    if (exiting) return;
    setExiting(true);
    closeTimerRef.current = window.setTimeout(onClose, 200);
  }

  // 点击消息里另一个引用时，跟随切换面板当前文档
  useEffect(() => {
    setSelectedDocumentId(initialDocumentId);
  }, [initialDocumentId]);

  const selected = documentButtons.find((d) => d.documentId === selectedDocumentId) ?? null;
  const docChunks = useMemo(
    () => citations.filter((c) => c.documentId === selectedDocumentId),
    [citations, selectedDocumentId]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, exiting]);

  return (
    <aside
      role={floating ? "dialog" : undefined}
      aria-modal={floating ? false : undefined}
      aria-label="文档预览"
      className={cn(
        "z-40 flex min-h-0 w-full flex-col bg-background shadow-2xl",
        floating
          ? "fixed inset-y-0 right-0 w-full max-w-(--panel-width) border-l border-border shadow-2xl"
          : "fixed inset-x-0 bottom-0 top-16 md:static md:inset-auto md:z-auto md:w-(--panel-width) md:shadow-none",
        exiting
          ? "animate-out fade-out-0 slide-out-to-right-2 duration-200"
          : "animate-in fade-in-0 slide-in-from-right-4 duration-300"
      )}
      style={{ "--panel-width": `${width}px` } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 px-5 pt-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </div>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{selected?.filename ?? "引用来源"}</h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {selected && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              title="下载文档"
              aria-label="下载文档"
            >
              <a
                href={`/api/documents/${encodeURIComponent(selected.documentId)}/content?download=1`}
                download={selected.filename}
              >
                <Download className="size-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={requestClose}
            title="关闭预览"
            aria-label="关闭预览"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>

      {documentButtons.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-5 pt-4">
          {documentButtons.map((doc) => (
            <button
              key={doc.documentId}
              type="button"
              onClick={() => setSelectedDocumentId(doc.documentId)}
              className={cn(
                "max-w-44 shrink-0 truncate rounded-full px-3 py-1 text-xs transition-colors",
                doc.documentId === selectedDocumentId
                  ? "bg-primary/12 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {doc.filename}
            </button>
          ))}
        </div>
      )}

      {selected && docChunks.length > 0 && (
        <Tabs
          key={selectedDocumentId}
          defaultValue="chunks"
          className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4"
        >
          <TabsList className="grid h-9 w-full shrink-0 grid-cols-2 rounded-xl bg-muted p-1">
            <TabsTrigger value="chunks" className="rounded-lg">{floating ? "分块" : "引用段落"}</TabsTrigger>
            <TabsTrigger value="file" className="rounded-lg">原文件</TabsTrigger>
          </TabsList>
          <TabsContent value="chunks" className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p role="status" className="text-sm text-muted-foreground">正在加载分块…</p>
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : floating && docChunks.every((chunk) => !chunk.content) ? (
              <p className="text-sm text-muted-foreground">暂无可展示的分块。</p>
            ) : (
              <CitedChunks chunks={docChunks} />
            )}
          </TabsContent>
          <TabsContent value="file" className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <FilePreview citation={docChunks[0]} chunks={floating ? [] : docChunks} />
          </TabsContent>
        </Tabs>
      )}
    </aside>
  );
}

/** Tab1：召回段落列表，markdown 渲染，标注相关度。 */
function CitedChunks({ chunks }: { chunks: CitationChunk[] }) {
  if (chunks.every((chunk) => !chunk.content)) {
    return (
      <div className="rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
        这条历史消息的引用未保存段落内容，请切换到「原文件」查看。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {chunks.map((chunk, index) => {
        const percent =
          typeof chunk.score === "number"
            ? Math.round(Math.max(0, Math.min(1, chunk.score)) * 100)
            : null;
        return (
          <section key={`${chunk.documentId}-${chunk.chunkIndex}-${index}`} className="rounded-xl bg-muted/40 p-4">
            <header className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                段落 {chunk.chunkIndex + 1}
              </span>
              {percent !== null && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="tabular-nums">相关度 {percent}%</span>
                </span>
              )}
            </header>
            {chunk.content ? (
              <MessageMarkdown content={chunk.content} />
            ) : (
              <p className="text-sm text-muted-foreground">该段落内容缺失</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Tab2：原文件预览。docx 走消毒 HTML + sandbox iframe；文本类支持段落高亮。 */
function FilePreview({ citation, chunks }: { citation: CitationChunk; chunks: CitationChunk[] }) {
  const previewType = getPreviewType(citation.filename);
  const previewUrl = `/api/documents/${encodeURIComponent(citation.documentId)}/content`;
  const needles = useMemo(
    () => chunks.map((chunk) => chunk.content ?? "").filter(Boolean),
    [chunks]
  );

  const { data: textContent, isLoading, error } = useQuery<string>({
    queryKey: ["document-preview", citation.documentId],
    queryFn: async () => {
      const response = await fetch(previewUrl);
      if (!response.ok) throw new Error("无法加载文档内容");
      return response.text();
    },
    enabled: previewType === "markdown" || previewType === "text",
    staleTime: 5 * 60 * 1000,
  });

  // 文本类高亮后滚动到第一处命中
  const textContainerRef = useRef<HTMLDivElement>(null);
  const preContainerRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (previewType !== "markdown" && previewType !== "text") return;
    if (textContent === undefined) return;
    const container = previewType === "markdown" ? textContainerRef.current : preContainerRef.current;
    container?.querySelector("mark")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [previewType, textContent]);

  if (previewType === "pdf") {
    return (
      <iframe className="h-full min-h-[70dvh] w-full rounded-md border border-border" src={previewUrl} title={citation.filename} />
    );
  }

  if (previewType === "html") {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
        <FileText className="size-8 text-muted-foreground" />
        <p className="font-medium">HTML 文件不在页面内直接运行</p>
        <p className="max-w-md text-sm text-muted-foreground">为避免文档脚本访问当前登录会话，请下载后在本地查看。</p>
      </div>
    );
  }

  if (previewType === "docx") {
    return <DocxPreview citation={citation} needles={needles} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label="正在加载文档预览" role="status">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (error || textContent === undefined) {
    return <p className="text-sm text-destructive">文档预览加载失败，请下载后查看。</p>;
  }

  if (previewType === "markdown") {
    const segments = buildHighlightSegments(textContent, needles);
    return (
      <div ref={textContainerRef}>
        {segments.map((segment, index) =>
          segment.highlight ? (
            <mark
              key={index}
              className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-500/40"
            >
              {segment.text}
            </mark>
          ) : (
            <MessageMarkdown key={index} content={segment.text} />
          )
        )}
      </div>
    );
  }

  const segments = buildHighlightSegments(textContent, needles);
  return (
    <pre
      ref={preContainerRef}
      className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground"
    >
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark
            key={index}
            className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-500/40"
          >
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </pre>
  );
}

/**
 * docx 预览：服务端已做 mammoth 转 HTML + 白名单消毒 + CSP。
 * 前端再注入 <mark> 高亮与滚动脚本，放进 sandbox iframe（无同源、无 cookie、
 * 脚本在隔离源里运行，拿不到父页面任何数据）。图片仅 data URI，无外部请求。
 */
function DocxPreview({ citation, needles }: { citation: CitationChunk; needles: string[] }) {
  const { data: html, isLoading, error } = useQuery<string>({
    queryKey: ["docx-preview", citation.documentId],
    queryFn: async () => {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(citation.documentId)}/content?format=html`
      );
      if (!response.ok) throw new Error("无法生成文档预览");
      return response.text();
    },
    staleTime: 5 * 60 * 1000,
  });

  const srcDoc = useMemo(() => {
    if (html === undefined) return "";
    const withMarks = injectHighlightsIntoHtml(html, needles);
    return withMarks.replace("</body>", `${DOCX_SCROLL_SCRIPT}</body>`);
  }, [html, needles]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label="正在生成文档预览" role="status">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (error || srcDoc === "") {
    return <p className="text-sm text-destructive">文档预览生成失败，请下载后查看。</p>;
  }

  return (
    <iframe
      sandbox="allow-scripts"
      className="h-full min-h-[70dvh] w-full rounded-md border border-border bg-white"
      srcDoc={srcDoc}
      title={citation.filename}
    />
  );
}

/** 在 sandbox iframe 内部滚动到第一处高亮（父页面因 sandbox 无法访问其 DOM）。 */
const DOCX_SCROLL_SCRIPT = `<script>window.addEventListener("load",function(){setTimeout(function(){var m=document.querySelector("mark");if(m)m.scrollIntoView({block:"center"})},50)})</script>`;

function getPreviewType(filename: string): "pdf" | "markdown" | "html" | "docx" | "text" {
  if (/\.pdf$/i.test(filename)) return "pdf";
  if (/\.(md|markdown)$/i.test(filename)) return "markdown";
  if (/\.html?$/i.test(filename)) return "html";
  if (/\.docx$/i.test(filename)) return "docx";
  return "text";
}

