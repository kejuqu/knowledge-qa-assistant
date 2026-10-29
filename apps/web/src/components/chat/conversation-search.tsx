"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquare, Search, X } from "lucide-react";
import { Button } from "@kqa/ui/components/button";
import { useRouter } from "next/navigation";
import { useSidebar } from "@kqa/ui/components/sidebar";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@kqa/ui/components/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@kqa/ui/components/command";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { useChatStore } from "@/stores/chat-store";

interface SearchConversation {
  id: string;
  title: string;
  createdAt: string;
}

interface SearchPage {
  items: SearchConversation[];
  nextCursor: string | null;
}

function conversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((now - day) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days > 1 && days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function ConversationSearch() {
  const router = useRouter();
  const { isMobile, setMobileOpen } = useSidebar();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const streaming = useChatStore((state) => state.streaming);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["conversations", "search", query],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (query) params.set("q", query);
      if (pageParam) params.set("cursor", pageParam);
      const response = await fetch(`/api/conversations?${params}`, { signal });
      if (!response.ok) throw new Error("加载对话失败");
      return await response.json() as SearchPage;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const conversations = data?.pages.flatMap((page) => page.items) ?? [];

  function selectConversation(id: string) {
    if (streaming) return;
    useChatStore.getState().setActiveConversation(id);
    setOpen(false);
    if (isMobile) setMobileOpen(false);
    router.push(`/chat?id=${encodeURIComponent(id)}`);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) { setSearch(""); setQuery(""); }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-xl" aria-label="搜索对话" title="搜索对话">
          <Search data-icon="inline-start" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:left-1/2 md:top-[12dvh] md:h-auto md:max-h-[76dvh] md:w-[calc(100%-3rem)] md:max-w-3xl md:-translate-x-1/2 md:rounded-3xl"
      >
        <DialogTitle className="sr-only">搜索对话</DialogTitle>
        <DialogDescription className="sr-only">搜索历史对话，使用方向键选择，按 Enter 打开。</DialogDescription>
        <Command shouldFilter={false} className="min-h-0 flex-1 rounded-none">
          <div className="flex shrink-0 items-center gap-2 px-3 py-3 [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:min-w-0 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0 md:px-5 md:py-4">
            <CommandInput value={search} onValueChange={setSearch} placeholder="搜索对话内容" aria-label="搜索对话内容" className=" text-small" />
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="关闭搜索"><X data-icon="inline-start" /></Button>
            </DialogClose>
          </div>
          <CommandList className="min-h-0 max-h-none flex-1 overscroll-contain px-2 pb-4 md:max-h-[calc(76dvh-6rem)] md:flex-initial md:px-4">
            <div aria-live="polite" role="status" className="sr-only">{isLoading ? "正在加载对话" : `共加载 ${conversations.length} 条对话`}</div>
            {isLoading && <div className="flex flex-col gap-4 px-4 py-6" aria-label="正在加载对话"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-6 w-3/5" /><Skeleton className="h-6 w-2/3" /></div>}
            {isError ? (
              <CommandGroup heading="加载对话失败">
                <CommandItem value="retry" onSelect={() => void refetch()}>重试</CommandItem>
              </CommandGroup>
            ) : !isLoading && (
              <>
                <CommandEmpty>{query ? "没有找到匹配的对话" : "还没有对话"}</CommandEmpty>
                <CommandGroup heading={query ? "搜索结果" : "近期对话"}>
                  {conversations.map((conversation) => (
                    <CommandItem key={conversation.id} value={conversation.id} disabled={streaming} onSelect={() => selectConversation(conversation.id)} className="min-h-14 gap-3 rounded-xl px-3 py-3 md:min-h-16 md:gap-4 md:px-4">
                      <MessageSquare />
                      <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                      <time dateTime={conversation.createdAt} className="shrink-0 text-xs text-muted-foreground">{conversationDate(conversation.createdAt)}</time>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {hasNextPage && <CommandGroup><CommandItem value="load-more" disabled={isFetchingNextPage} onSelect={() => void fetchNextPage()} className="justify-center">{isFetchingNextPage ? "加载中…" : "加载更多对话"}</CommandItem></CommandGroup>}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
