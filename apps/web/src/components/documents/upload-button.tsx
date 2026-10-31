"use client";

import { useRef } from "react";
import { Button } from "@kqa/ui/components/button";
import { Upload } from "lucide-react";
import { ACCEPT_STRING } from "./use-document-upload";

interface UploadButtonProps {
  onSelect: (files: File[]) => void;
}

/** 顶部工具栏的上传按钮：内部封装隐藏 file input（进度条由 UploadProgressList 单独渲染） */
export function UploadButton({ onSelect }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button onClick={() => inputRef.current?.click()} className="w-full shrink-0 text-white sm:w-auto">
        <Upload />
        上传文档
      </Button>
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
    </>
  );
}
