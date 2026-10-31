"use client";

import { usePermission } from "@/components/tenant-role";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** 前端可选择的文件类型（与服务端 @kqa/ai 的 SUPPORTED_EXTENSIONS 对齐） */
export const ACCEPT_STRING = ".txt,.md,.markdown,.html,.htm,.pdf,.docx";

export interface UploadTask {
  id: string;
  name: string;
  progress: number;
}

export function useDocumentUpload() {
  const canUpload = usePermission("documents.upload");
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const seq = useRef(0);

  function updateTask(id: string, patch: Partial<UploadTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  /**
   * 上传文件：XMLHttpRequest 才能拿到上传进度，fetch 目前不支持。
   * 进度分两段：0-90% 是浏览器到服务端的上传，90-100% 留给服务端解析入库。
   */
  async function uploadFile(file: File, id: string) {
    function reportError(message: string) {
      setError((previous) => [previous, `${file.name}：${message}`].filter(Boolean).join("\n"));
    }
    const formData = new FormData();
    formData.append("file", file);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents");
      xhr.timeout = 30_000; // 30 秒超时，避免网络卡死无限等待

      xhr.upload.onprogress = (e) => {
        // ProgressEvent.lengthComputable 是只读布尔属性，标记这个进度事件对应的资源总长度是否可以计算。
        // 如果它是 false，那么 ProgressEvent.total 这个属性的值就没有意义。
        if (e.lengthComputable) {
          updateTask(id, { progress: Math.round((e.loaded / e.total) * 90) });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // 刷新文档列表前移除上传卡片，避免与已入库的文档卡片同时展示。
          // 后续排队、向量化进度由文档卡片和 SSE 状态更新承接。
          removeTask(id);
        } else {
          let message = "上传失败";
          try {
            message = JSON.parse(xhr.responseText).error ?? message;
          } catch {}
          reportError(message);
          removeTask(id);
        }
        resolve();
      };

      xhr.onerror = () => {
        reportError("网络错误，上传失败");
        removeTask(id);
        resolve();
      };

      xhr.ontimeout = () => {
        reportError("上传超时，请检查网络后重试");
        removeTask(id);
        resolve();
      };

      xhr.send(formData);
    });

    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  async function upload(selection: File | File[]) {
    if (!canUpload) {
      setError("没有上传知识库文档的权限");
      return;
    }
    const files = Array.isArray(selection) ? selection : [selection];
    if (!files.length) return;
    setError("");
    const batch = files.map((file) => ({ file, id: `up-${++seq.current}` }));
    setTasks((previous) => [
      ...previous,
      ...batch.map(({ file, id }) => ({ id, name: file.name, progress: 0 })),
    ]);
    // 逐个传输，避免一次选择大量文件时耗尽连接与服务端解析内存。
    for (const { file, id } of batch) await uploadFile(file, id);
  }

  return { upload, tasks, error };
}
