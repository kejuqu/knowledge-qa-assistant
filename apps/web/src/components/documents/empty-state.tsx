"use client";

import { useRef } from "react";
import { UploadCloud } from "lucide-react";
import { ACCEPT_STRING } from "./use-document-upload";

interface EmptyStateProps {
  onSelect: (files: File[]) => void;
}

/** 空知识库时的引导卡片：整块可点击，也支持拖拽文件进来（进度条由 UploadProgressList 渲染） */
export function EmptyState({ onSelect }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onSelect(files);
      }}
      className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed py-20 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <UploadCloud className="size-10" />
      <p className="text-base font-medium">点击或拖拽文件到这里上传，支持多选</p>
      <p className="text-sm">支持 PDF / Word(docx) / Markdown / TXT / HTML，单文件 ≤ 20MB</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onSelect(files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
