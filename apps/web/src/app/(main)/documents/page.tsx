"use client";

import { useQuery } from "@tanstack/react-query";
import { UploadButton } from "@/components/documents/upload-button";
import { EmptyState } from "@/components/documents/empty-state";
import { DocumentList, type DocumentItem } from "@/components/documents/document-list";
import { useDocumentUpload } from "@/components/documents/use-document-upload";

export default function DocumentsPage() {
  const { upload, uploading, error } = useDocumentUpload();

  const { data: docs = [] } = useQuery<DocumentItem[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "processing") ? 2000 : false,
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
          {docs.length > 0 && <UploadButton uploading={uploading} onSelect={upload} />}
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {docs.length === 0 ? (
          <EmptyState uploading={uploading} onSelect={upload} />
        ) : (
          <DocumentList docs={docs} />
        )}
      </div>
    </div>
  );
}
