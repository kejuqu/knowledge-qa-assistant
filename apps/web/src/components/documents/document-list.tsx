"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardDescription, CardHeader, CardTitle } from "@kqa/ui/components/card";
import { Button } from "@kqa/ui/components/button";
import { FileText, Loader2, CheckCircle2, XCircle, Clock, Trash2, RotateCw } from "lucide-react";

export interface DocumentItem {
  id: string;
  filename: string;
  sizeBytes: number;
  chunkCount: number;
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  createdAt: string;
}

const STATUS_META: Record<
  DocumentItem["status"],
  { icon: React.ReactNode; label: string }
> = {
  pending: {
    icon: <Clock className="size-4 text-muted-foreground" />,
    label: "排队中",
  },
  processing: {
    icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
    label: "处理中",
  },
  ready: {
    icon: <CheckCircle2 className="size-4 text-primary" />,
    label: "就绪",
  },
  failed: {
    icon: <XCircle className="size-4 text-destructive" />,
    label: "失败",
  },
};

export function DocumentCard({ doc }: { doc: DocumentItem }) {
  const meta = STATUS_META[doc.status];
  const canDelete = doc.status === "ready" || doc.status === "failed";
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const queryClient = useQueryClient();

  async function handleDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "删除失败");
      return;
    }
    // SSE 会推送 document:deleted，这里立即本地移除，避免等事件
    queryClient.setQueryData<Array<Record<string, unknown>>>(
      ["documents"],
      (old) => old?.filter((d) => d.id !== doc.id) ?? old
    );
  }

  async function handleRetry() {
    if (doc.status !== "failed" || retrying) return;
    setRetrying(true);
    const res = await fetch(`/api/documents/${doc.id}/retry`, { method: "POST" });
    const data = await res.json();
    setRetrying(false);
    if (!res.ok) {
      alert(data.error ?? "重新解析失败");
      return;
    }
    queryClient.setQueryData<Array<Record<string, unknown>>>(["documents"], (old) =>
      old?.map((item) => (item.id === doc.id ? { ...item, ...data.document } : item)) ?? old
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 p-4">
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{doc.filename}</CardTitle>
          <CardDescription className="text-xs">
            {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.chunkCount} 个分块 ·{" "}
            {new Date(doc.createdAt).toLocaleString("zh-CN")}
            {doc.status === "failed" && doc.error && (
              <span className="block text-destructive">原因：{doc.error}</span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {meta.icon}
          </div>
          {doc.status === "failed" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-primary hover:text-primary"
              disabled={retrying}
              onClick={handleRetry}
              title={retrying ? "正在重新解析…" : "重新解析文档"}
            >
              <RotateCw className={retrying ? "size-3.5 animate-spin" : "size-3.5"} />
              重新解析
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              disabled={deleting}
              onClick={handleDelete}
              title={deleting ? "删除中…" : "删除文档"}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

export function DocumentList({ docs }: { docs: DocumentItem[] }) {
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <DocumentCard key={d.id} doc={d} />
      ))}
    </div>
  );
}
