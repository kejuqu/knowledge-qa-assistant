"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface DocumentStatusEvent {
  id: string;
  status: "pending" | "processing" | "ready" | "failed";
  chunkCount: number;
  error: string | null;
}

/**
 * 订阅服务端 SSE 事件流：文档状态变更时精准更新 TanStack Query 缓存，
 * 避免整页轮询。断开时自动重连。
 */
export function useDocumentEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");

    function handleDocumentChange(e: MessageEvent) {
      try {
        const data = JSON.parse(e.data) as DocumentStatusEvent;
        queryClient.setQueryData<Array<Record<string, unknown>>>(
          ["documents"],
          (old) =>
            old?.map((doc) =>
              doc.id === data.id
                ? {
                    ...doc,
                    status: data.status,
                    chunkCount: data.chunkCount,
                    error: data.error,
                  }
                : doc
            ) ?? old
        );
      } catch {
        // 非 JSON 消息忽略
      }
    }

    function handleDocumentDeleted(e: MessageEvent) {
      try {
        const { id } = JSON.parse(e.data) as { id: string };
        queryClient.setQueryData<Array<Record<string, unknown>>>(
          ["documents"],
          (old) => old?.filter((doc) => doc.id !== id) ?? old
        );
      } catch {}
    }

    source.addEventListener("document", handleDocumentChange);
    source.addEventListener("document:deleted", handleDocumentDeleted);
    // 兜底：SSE 断线重连期间，低频轮询保证状态最终一致
    source.onerror = () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    };

    return () => source.close();
  }, [queryClient]);
}
