"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kqa/ui/components/card";
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Doc {
  id: string;
  filename: string;
  sizeBytes: number;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  createdAt: string;
}

const STATUS_ICON = {
  processing: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
  ready: <CheckCircle2 className="size-4 text-green-600" />,
  failed: <XCircle className="size-4 text-destructive" />,
};

export default function DocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: docs = [] } = useQuery<Doc[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "processing") ? 2000 : false,
  });

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "上传失败");
    }
    e.target.value = "";
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">知识库</h1>
            <p className="text-sm text-muted-foreground">
              上传 .txt / .md 文档，自动切分并向量化到 Milvus
            </p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            上传文档
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {docs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <FileText className="size-8" />
              <p>还没有文档，点击右上角上传</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <Card key={d.id}>
                <CardHeader className="flex-row items-center gap-3 space-y-0 p-4">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <CardTitle className="text-sm">{d.filename}</CardTitle>
                    <CardDescription className="text-xs">
                      {(d.sizeBytes / 1024).toFixed(1)} KB · {d.chunkCount} 个分块 ·{" "}
                      {new Date(d.createdAt).toLocaleString("zh-CN")}
                    </CardDescription>
                  </div>
                  {STATUS_ICON[d.status]}
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
