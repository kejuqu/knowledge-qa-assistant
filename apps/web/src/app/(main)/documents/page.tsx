"use client";

import { useQuery } from "@tanstack/react-query";
import { UploadButton } from "@/components/documents/upload-button";
import { EmptyState } from "@/components/documents/empty-state";
import { DocumentList, type DocumentItem } from "@/components/documents/document-list";
import { UploadProgressList } from "@/components/documents/upload-progress";
import { useDocumentUpload } from "@/components/documents/use-document-upload";
import { useDocumentEvents } from "@/components/documents/use-document-events";

export default function DocumentsPage() {
  const { upload, tasks, error } = useDocumentUpload();
  // SSE：服务端处理状态变更实时推送到 TanStack Query 缓存
  useDocumentEvents();

  const { data: docs = [] } = useQuery<DocumentItem[]>({
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
          {docs.length > 0 && <UploadButton onSelect={upload} />}
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <UploadProgressList tasks={tasks} />

        {docs.length === 0 && tasks.length === 0 ? (
          <EmptyState onSelect={upload} />
        ) : (
          <DocumentList docs={docs} />
        )}
      </div>
    </div>
  );
}
