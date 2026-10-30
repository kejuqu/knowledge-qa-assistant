"use client";

import { useTenantRole } from "@/components/tenant-role";
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
  const isAdmin = useTenantRole() === "admin";
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
  async function upload(file: File) {
    if (!isAdmin) {
      setError("仅租户管理员可上传知识库文档");
      return;
    }
    setError("");
    const id = `up-${++seq.current}`;
    setTasks((prev) => [...prev, { id, name: file.name, progress: 0 }]);

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
          updateTask(id, { progress: 100 });
          // 上传完成，SSE 会推送 processing -> ready，进度条短暂展示 100% 后消失
          setTimeout(() => removeTask(id), 800);
        } else {
          let message = "上传失败";
          try {
            message = JSON.parse(xhr.responseText).error ?? message;
          } catch {}
          setError(message);
          removeTask(id);
        }
        resolve();
      };

      xhr.onerror = () => {
        setError("网络错误，上传失败");
        removeTask(id);
        resolve();
      };

      xhr.ontimeout = () => {
        setError("上传超时，请检查网络后重试");
        removeTask(id);
        resolve();
      };

      xhr.send(formData);
    });

    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  return { upload, tasks, error };
}
