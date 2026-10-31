"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell, BellCheck, Trash2 } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@kqa/ui/components/empty";
import { Button } from "@kqa/ui/components/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem } from "@kqa/ui/components/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@kqa/ui/components/alert-dialog";
import { NOTIFICATION_ROUTES } from "@/lib/notification-route";
import type { StoredNotificationContent } from "@kqa/db/notifications";

type Notification = StoredNotificationContent & { id: string; title: string; readAt: string | null };
type Inbox = { items: Notification[]; unreadCount: number };

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export function NotificationMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dismissingIds, setDismissingIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const { data, error, refetch } = useQuery<Inbox>({
    queryKey: ["notifications"], refetchInterval: busy ? false : 15_000,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/notifications", { signal });
      if (!response.ok) throw new Error("通知加载失败");
      return response.json();
    },
  });

  async function dismiss(item?: Notification) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    // 保留正在消失的行，避免后台刷新在动画完成前将其卸载。
    await queryClient.cancelQueries({ queryKey: ["notifications"] });
    const snapshot = queryClient.getQueryData<Inbox>(["notifications"]);
    const ids = item ? [item.id] : snapshot?.items.map((notification) => notification.id) ?? [];
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { id: item.id } : {}),
      });
      if (!response.ok) throw new Error("通知移除失败，请重试");
      if (!item) {
        setClearOpen(false);
        setOpen(true);
        await nextPaint();
      }
      setDismissingIds(ids);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : 220));
      queryClient.setQueryData<Inbox>(["notifications"], (current) => current ? {
        items: item ? current.items.filter((notification) => !ids.includes(notification.id)) : [],
        unreadCount: item ? Math.max(0, current.unreadCount - 1) : 0,
      } : current);
      setDismissingIds([]);
      if (item) {
        setOpen(false);
        // 权限变更通知跳转前更新当前成员权限。
        void queryClient.invalidateQueries({ queryKey: ["membership"] });
        router.push(NOTIFICATION_ROUTES[item.type]);
        router.refresh();
      }
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <>
    <DropdownMenu open={open} onOpenChange={(nextOpen) => {
      if (busyRef.current) return;
      setOpen(nextOpen);
      if (nextOpen) { setActionError(""); void refetch(); }
    }}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative size-8 shrink-0" aria-label={`通知${data?.unreadCount ? `，${data.unreadCount} 条未读` : ""}`}>
        <Bell />{Boolean(data?.unreadCount) && <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">{data!.unreadCount > 99 ? "99+" : data!.unreadCount}</span>}
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between gap-2">
            <DropdownMenuLabel>通知</DropdownMenuLabel>
            {Boolean(data?.items.length) && <DropdownMenuItem disabled={busy} onSelect={(event) => {
              event.preventDefault(); setActionError(""); setOpen(false); setClearOpen(true);
            }}><Trash2 />清空通知</DropdownMenuItem>}
          </div>
          {(error || actionError) && <p role="alert" className="px-2 py-2 text-sm text-destructive">{actionError || error?.message}</p>}
          {!data?.items.length && !error && <Empty className="empty-state relative overflow-hidden px-5 py-10">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="empty-glow absolute left-1/2 top-14 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl" />
            </div>
            <EmptyHeader className="relative">
              <div className="relative mb-3">
                <div aria-hidden className="empty-orbit absolute -inset-2 rounded-full border border-dashed border-primary/20" />
                <EmptyMedia variant="icon" className="size-11 rounded-full border border-primary/25 bg-gradient-to-b from-primary/30 to-primary/5 text-primary shadow-[inset_0_1px_0_0] shadow-primary/25">
                  <BellCheck className="size-5" />
                </EmptyMedia>
              </div>
              <EmptyDescription>暂无你需要处理的消息～</EmptyDescription>
            </EmptyHeader>
          </Empty>}
          {data?.items.map((item) => <div key={item.id} data-dismissing={dismissingIds.includes(item.id)} className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity,transform] duration-[220ms] ease-in-out data-[dismissing=true]:translate-x-2 data-[dismissing=true]:grid-rows-[0fr] data-[dismissing=true]:opacity-0 motion-reduce:transition-none">
            <div className="min-h-0 overflow-hidden">
              <DropdownMenuItem disabled={busy} className="flex flex-col items-start gap-1 py-3" onSelect={(event) => { event.preventDefault(); void dismiss(item); }}>
                <span className="text-sm">{!item.readAt && <span className="mr-1 text-primary" aria-label="未读">●</span>}{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.body.message}</span>
              </DropdownMenuItem>
            </div>
          </div>)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={clearOpen} onOpenChange={(nextOpen) => { if (!busyRef.current) setClearOpen(nextOpen); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>清空所有通知？</AlertDialogTitle><AlertDialogDescription>清空后这些消息将不再显示。团队加入申请仍可在团队管理中处理。</AlertDialogDescription></AlertDialogHeader>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        <AlertDialogFooter>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void dismiss(); }}>{busy ? "清空中…" : "确认清空"}</AlertDialogAction>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
