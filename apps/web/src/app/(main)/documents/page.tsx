"use client";

import { useTenantRole } from "@/components/tenant-role";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { UploadButton } from "@/components/documents/upload-button";
import { EmptyState } from "@/components/documents/empty-state";
import { DocumentList, type DocumentItem } from "@/components/documents/document-list";
import { UploadProgressList } from "@/components/documents/upload-progress";
import { useDocumentUpload } from "@/components/documents/use-document-upload";
import { useDocumentEvents } from "@/components/documents/use-document-events";

export default function DocumentsPage() {
  const isAdmin = useTenantRole() === "admin";
  const { upload, tasks, error } = useDocumentUpload();
  // SSE：服务端处理状态变更实时推送到 TanStack Query 缓存
  useDocumentEvents();

  const { data: docs = [], isLoading } = useQuery<DocumentItem[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
  });

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">知识库</h1>
            <p className="text-sm text-muted-foreground">
              支持 PDF / Word(docx) / Markdown / TXT / HTML，解析后自动切分并向量化到 Milvus
            </p>
          </div>
          {isAdmin && docs.length > 0 && <UploadButton onSelect={upload} />}
        </div>

        {error && <p role="alert" className="mb-4 whitespace-pre-line text-sm text-destructive">{error}</p>}

        <UploadProgressList tasks={tasks} />

        {isLoading ? (
          <DocumentListSkeleton />
        ) : docs.length === 0 && tasks.length === 0 ? (
          isAdmin ? <EmptyState onSelect={upload} /> : (
            <p className="py-20 text-center text-sm text-muted-foreground">知识库暂无文档，请联系管理员上传。</p>
          )
        ) : (
          <DocumentList docs={docs} />
        )}
      </div>
    </div>
  );
}

function DocumentListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="正在加载文档" role="status">
      {["first", "second", "third"].map((key) => (
        <div key={key} className="flex items-center gap-3 rounded-xl bg-card p-4">
          <Skeleton className="size-5 shrink-0 rounded" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
