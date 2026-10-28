"use client";

import { Progress } from "@kqa/ui/components/progress";
import { FileText } from "lucide-react";
import type { UploadTask } from "./use-document-upload";

interface UploadProgressListProps {
  tasks: UploadTask[];
}

/** 上传进度条列表：多个文件同时上传时逐个展示 */
export function UploadProgressList({ tasks }: UploadProgressListProps) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 truncate text-sm font-medium">{t.name}</p>
            <Progress value={t.progress} />
          </div>
          <span className="w-10 text-right text-xs text-muted-foreground">
            {t.progress}%
          </span>
        </div>
      ))}
    </div>
  );
}
