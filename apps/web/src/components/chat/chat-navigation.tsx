"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kqa/ui/components/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kqa/ui/components/dropdown-menu";
import { useSidebar } from "@kqa/ui/components/sidebar";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { OverflowText } from "@kqa/ui/components/overflow-text";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { cn } from "@kqa/ui/lib/utils";
import { ChevronDown, FileText, MessageSquare, Plus, Settings, MoreVertical, Pin, PinOff, Pencil, Trash2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
}

interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

const NAV = [
  { href: "/documents", label: "知识库", icon: FileText },
  { href: "/settings", label: "模型设置", icon: Settings },
];

async function getConversations({ pageParam, search }: { pageParam: string | null; search: string }) {
  const params = new URLSearchParams({ limit: "20" });
  if (pageParam) params.set("cursor", pageParam);
  if (search.trim()) params.set("q", search.trim());
  const response = await fetch(`/api/conversations?${params}`);
  if (!response.ok) throw new Error("加载对话列表失败");
  return (await response.json()) as ConversationPage;
}

interface ConversationListProps {
  onSelect: (conversationId: string) => void;
  variant?: "inline" | "popover";
}

function ConversationList({ onSelect, variant = "inline" }: ConversationListProps) {
  const { activeConversationId, streaming } = useChatStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  async function updateConversation(conversation: Conversation, action: "pin" | "rename" | "delete") {
    if (busy || streaming) return;
    let title: string | null = null;
    if (action === "rename") {
      title = window.prompt("重命名对话（最多 200 个字符）", conversation.title);
      if (title === null) return;
      title = title.trim();
      if (!title || title.length > 200) { window.alert("标题须为 1–200 个字符"); return; }
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action !== "delete" ? { body: JSON.stringify(action === "pin" ? { pinned: !conversation.pinned } : { title }) } : {}),
      });
      if (!response.ok) throw new Error((await response.json()).error || "操作失败");
      if (action === "delete") {
        queryClient.removeQueries({ queryKey: ["messages", conversation.id] });
        if (activeConversationId === conversation.id) {
          useChatStore.getState().setActiveConversation(null);
          router.push("/chat");
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) { window.alert(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!conversationToDelete) return;
    await updateConversation(conversationToDelete, "delete");
    setConversationToDelete(null);
  }
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["conversations", ""],
    queryFn: ({ pageParam }) => getConversations({ pageParam, search: "" }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const conversations = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
    <div
      className={cn(
        "flex flex-col gap-1 overflow-y-auto",
        variant === "inline"
          ? "ml-4 mt-2 max-h-72 pb-1 pl-2 pr-0.5"
          : "max-h-96 px-1 pb-1"
      )}
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
      {isLoading && <ConversationListSkeleton />}
      {!isLoading && conversations.length === 0 && (
        <p className="px-2 py-1 text-xs text-sidebar-foreground/60">还没有对话</p>
      )}
      {conversations.map((conversation) => (
        <div key={conversation.id} className={cn(
          "group flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent",
          conversation.id === activeConversationId && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}>
          <button type="button" disabled={streaming} onClick={() => onSelect(conversation.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left text-xs text-sidebar-foreground disabled:opacity-50"
            aria-current={conversation.id === activeConversationId ? "page" : undefined}>
            {conversation.pinned && <Pin className="size-3 shrink-0" aria-label="已固定" />}
            <OverflowText text={conversation.title} className="flex-1" side="right" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={busy || streaming}
                className="mr-1 size-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label={`对话操作：${conversation.title}`}><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="border-0">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => void updateConversation(conversation, "pin")}>
                  {conversation.pinned ? <PinOff /> : <Pin />}{conversation.pinned ? "取消固定" : "固定"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void updateConversation(conversation, "rename")}><Pencil />重命名</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConversationToDelete(conversation)}><Trash2 />删除</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      {isFetchingNextPage && <ConversationListSkeleton />}
    </div>
    <AlertDialog
      open={Boolean(conversationToDelete)}
      onOpenChange={(open) => {
        if (!open && !busy) setConversationToDelete(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除对话？</AlertDialogTitle>
          <AlertDialogDescription>
            删除“{conversationToDelete?.title}”及其中全部消息后将无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            disabled={busy || streaming}
            onClick={(event) => {
              event.preventDefault();
              void confirmDelete();
            }}
          >
            {busy ? "删除中…" : "删除"}
          </AlertDialogAction>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function ConversationPopover({
  onSelect,
  active,
}: {
  onSelect: (conversationId: string) => void;
  active: boolean;
}) {
  return (
    <DropdownMenu>
      <TooltipHint content="问答" side="right">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-10 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
            aria-label="查看问答记录"
          >
            <MessageSquare data-icon="inline-start" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipHint>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={14}
        className="w-80 border-0 bg-sidebar p-2 text-sidebar-foreground shadow-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2 text-sidebar-foreground/60">问答记录</DropdownMenuLabel>
        </DropdownMenuGroup>
        <ConversationList onSelect={onSelect} variant="popover" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 py-1.5" aria-label="正在加载对话" role="status">
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** 主导航中的问答分组：展开后显示可滚动、按需加载的会话列表。 */
export function ChatNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, isMobile, setMobileOpen } = useSidebar();
  const { setActiveConversation } = useChatStore();
  const [expanded, setExpanded] = useState(pathname === "/chat");
  const isChat = pathname === "/chat";

  useEffect(() => {
    if (isChat) setExpanded(true);
  }, [isChat]);

  function startNewConversation() {
    if (useChatStore.getState().streaming) return;
    setActiveConversation(null);
    setExpanded(true);
    if (isMobile) setMobileOpen(false);
    router.push("/chat");
    window.dispatchEvent(new Event("kqa:new-conversation"));
  }

  function selectConversation(conversationId: string) {
    if (useChatStore.getState().streaming) return;
    setActiveConversation(conversationId);
    // 会话选择不应折叠所属的「问答」分组；从其他页面进入时也回到聊天页。
    setExpanded(true);
    if (isMobile) setMobileOpen(false);
    router.push(`/chat?id=${encodeURIComponent(conversationId)}`);
  }

  return (
    <nav className="flex flex-col gap-1.5">
      <div>
        {collapsed ? (
          <ConversationPopover onSelect={selectConversation} active={isChat} />
        ) : (
          <div
            className={`flex items-center rounded-xl transition-colors duration-200 ${
              isChat
                ? "bg-sidebar-accent"
                : "hover:bg-sidebar-accent"
            }`}
          >
            <Link
              href="/chat"
              onClick={() => {
                setExpanded(true);
                if (isMobile) setMobileOpen(false);
              }}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                isChat
                  ? "font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <MessageSquare className="size-4" />
              问答
            </Link>
            <TooltipHint content="新建对话">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mr-0.5 size-7 rounded-lg text-sidebar-primary hover:bg-sidebar-accent hover:text-sidebar-primary"
                onClick={startNewConversation}
                aria-label="新建对话"
              >
                <Plus data-icon="inline-start" />
              </Button>
            </TooltipHint>
            <TooltipHint content={expanded ? "收起对话列表" : "展开对话列表"}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mr-0.5 size-7 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent"
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "收起对话列表" : "展开对话列表"}
              >
                <ChevronDown className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
              </Button>
            </TooltipHint>
          </div>
        )}
        {!collapsed && expanded && <ConversationList onSelect={selectConversation} />}
      </div>
      {NAV.map((item) => {
        const linkClassName = `flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200 ${
          collapsed ? "justify-center px-2" : ""
        } ${
          pathname === item.href
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`;

        return (
          <TooltipHint key={item.href} content={item.label} side="right" hidden={!collapsed}>
            <Link href={item.href} className={linkClassName} aria-label={item.label} onClick={() => {
              if (isMobile) setMobileOpen(false);
            }}>
              <item.icon
                className={cn(
                  "size-4",
                  pathname === item.href && "text-sidebar-primary"
                )}
              />
              {!collapsed && item.label}
            </Link>
          </TooltipHint>
        );
      })}
    </nav>
  );
}
