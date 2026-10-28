"use client";

import { useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { ACCEPT_STRING } from "./use-document-upload";

interface EmptyStateProps {
  uploading: boolean;
  onSelect: (file: File) => void;
}

/** 空知识库时的引导卡片：整块可点击，也支持拖拽文件进来 */
export function EmptyState({ uploading, onSelect }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      disabled={uploading}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) onSelect(file);
      }}
      className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed py-20 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
    >
      {uploading ? (
        <Loader2 className="size-10 animate-spin" />
      ) : (
        <UploadCloud className="size-10" />
      )}
      <p className="text-base font-medium">
        {uploading ? "正在上传并解析…" : "点击或拖拽文件到这里上传"}
      </p>
      <p className="text-sm">支持 PDF / Word(docx) / Markdown / TXT / HTML，单文件 ≤ 20MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </button>
  );
}
