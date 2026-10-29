"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardDescription, CardHeader, CardTitle } from "@kqa/ui/components/card";
import { Button } from "@kqa/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@kqa/ui/components/alert-dialog";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const queryClient = useQueryClient();

  async function handleDelete() {
    if (!canDelete || deleting) return false;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "删除失败");
      }
      queryClient.setQueryData<Array<Record<string, unknown>>>(
        ["documents"], (old) => old?.filter((d) => d.id !== doc.id) ?? old
      );
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
      return false;
    } finally {
      setDeleting(false);
    }
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
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!deleting) setDeleteOpen(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  disabled={deleting}
                  title={deleting ? "删除中…" : "删除文档"}
                  aria-label="删除文档"
                >
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除文档？</AlertDialogTitle>
                  <AlertDialogDescription>
                    删除“{doc.filename}”后将无法恢复，相关知识库内容也会一并移除。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction
                    disabled={deleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDelete().then((deleted) => {
                        if (deleted) setDeleteOpen(false);
                      });
                    }}
                  >
                    {deleting ? "删除中…" : "删除"}
                  </AlertDialogAction>
                  <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
