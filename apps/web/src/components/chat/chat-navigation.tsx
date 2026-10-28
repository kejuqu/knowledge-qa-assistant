"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { ChevronDown, FileText, MessageSquare, Plus, Settings } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface Conversation {
  id: string;
  title: string;
}

interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

const NAV = [
  { href: "/documents", label: "知识库", icon: FileText },
  { href: "/settings", label: "模型设置", icon: Settings },
];

async function getConversations({ pageParam }: { pageParam: string | null }) {
  const params = new URLSearchParams({ limit: "20" });
  if (pageParam) params.set("cursor", pageParam);
  const response = await fetch(`/api/conversations?${params}`);
  if (!response.ok) throw new Error("加载对话列表失败");
  return (await response.json()) as ConversationPage;
}

function ConversationList() {
  const { activeConversationId, setActiveConversation } = useChatStore();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const conversations = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div
      className="mt-1 max-h-72 space-y-1 overflow-y-auto px-1 pb-1 pr-0.5"
      onScroll={(event) => {
        const element = event.currentTarget;
        if (
          hasNextPage &&
          !isFetchingNextPage &&
          element.scrollHeight - element.scrollTop - element.clientHeight < 48
        ) {
          fetchNextPage();
        }
      }}
    >
      {isLoading && <p className="px-2 py-1 text-xs text-muted-foreground">加载对话…</p>}
      {!isLoading && conversations.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">还没有对话</p>
      )}
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => setActiveConversation(conversation.id)}
          className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-all duration-200 ${
            conversation.id === activeConversationId
              ? "bg-white/80 font-medium text-primary shadow-[0_4px_14px_-10px_rgba(16,95,70,0.7)] ring-1 ring-emerald-700/10"
              : "text-muted-foreground hover:bg-white/65 hover:text-accent-foreground"
          }`}
        >
          {conversation.title}
        </button>
      ))}
      {isFetchingNextPage && <p className="px-2 py-1 text-xs text-muted-foreground">加载更多…</p>}
    </div>
  );
}

/** 主导航中的问答分组：展开后显示可滚动、按需加载的会话列表。 */
export function ChatNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { setActiveConversation } = useChatStore();
  const [expanded, setExpanded] = useState(pathname === "/chat");
  const isChat = pathname === "/chat";

  useEffect(() => {
    if (isChat) setExpanded(true);
  }, [isChat]);

  function startNewConversation() {
    setActiveConversation(null);
    setExpanded(true);
    router.push("/chat");
  }

  return (
    <nav className="flex-1 space-y-1.5">
      <div>
        <div
          className={`flex items-center rounded-xl border transition-all duration-200 ${
            isChat
              ? "border-emerald-700/10 bg-emerald-500/10 shadow-[0_8px_20px_-16px_rgba(10,108,75,0.75)]"
              : "border-transparent hover:bg-white/50"
          }`}
        >
          <Link
            href="/chat"
            onClick={() => setExpanded(true)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors ${
              isChat ? "font-medium text-emerald-950" : "text-muted-foreground hover:text-accent-foreground"
            }`}
          >
            <MessageSquare className="size-4" />
            问答
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-0.5 size-7 rounded-lg text-primary hover:bg-emerald-500/15 hover:text-primary"
            onClick={startNewConversation}
            title="新建对话"
            aria-label="新建对话"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-0.5 size-7 rounded-lg text-muted-foreground hover:bg-emerald-500/10"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? "收起对话列表" : "展开对话列表"}
            aria-label={expanded ? "收起对话列表" : "展开对话列表"}
          >
            <ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </Button>
        </div>
        {isChat && expanded && <ConversationList />}
      </div>
      {NAV.map((item) => {
        const linkClassName = `flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-sm transition-all duration-200 ${
          pathname === item.href
            ? "border-emerald-700/10 bg-white/75 font-medium text-emerald-950 shadow-[0_5px_16px_-14px_rgba(16,95,70,0.75)]"
            : "text-muted-foreground hover:bg-white/55 hover:text-accent-foreground"
        }`;

        return (
          <Link key={item.href} href={item.href} className={linkClassName}>
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
