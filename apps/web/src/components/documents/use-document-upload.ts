"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** 前端可选择的文件类型（与服务端 @kqa/ai 的 SUPPORTED_EXTENSIONS 对齐） */
export const ACCEPT_STRING = ".txt,.md,.markdown,.html,.htm,.pdf,.docx";

export function useDocumentUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  async function upload(file: File) {
    setError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "上传失败");
      }
    } finally {
      setUploading(false);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  }

  return { upload, uploading, error };
}
