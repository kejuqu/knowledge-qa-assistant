"use client";

import { create } from "zustand";

interface ChatState {
  /** 当前选中的会话；null 表示"新对话" */
  activeConversationId: string | null;
  /** 是否正在流式接收回答 */
  streaming: boolean;
  setActiveConversation: (id: string | null) => void;
  setStreaming: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  streaming: false,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setStreaming: (v) => set({ streaming: v }),
}));
