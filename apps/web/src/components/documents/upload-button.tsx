"use client";

import { useRef } from "react";
import { Button } from "@kqa/ui/components/button";
import { Upload, Loader2 } from "lucide-react";
import { ACCEPT_STRING } from "./use-document-upload";

interface UploadButtonProps {
  uploading: boolean;
  onSelect: (file: File) => void;
}

/** 顶部工具栏的上传按钮：内部封装隐藏 file input */
export function UploadButton({ uploading, onSelect }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        上传文档
      </Button>
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
    </>
  );
}
