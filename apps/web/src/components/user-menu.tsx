"use client";

import { Button } from "@kqa/ui/components/button";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { useSidebar } from "@kqa/ui/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@kqa/ui/components/dropdown-menu";
import { ChevronsLeft, LogOut, Palette } from "lucide-react";
import { ThemeOptions } from "./theme-toggle";

interface UserMenuProps {
  name: string;
  email: string;
  signOutUrl: string;
}

export function UserMenu({ name, email, signOutUrl }: UserMenuProps) {
  const { collapsed } = useSidebar();

  return (
    <DropdownMenu>
      <TooltipHint content="用户菜单" side="right" hidden={!collapsed}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={`h-auto w-full rounded-xl px-2.5 py-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
              collapsed ? "justify-center px-0" : "justify-start"
            }`}
            aria-label="打开用户菜单"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground">
              <ChevronsLeft />
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {name}
                  <span className="rounded-md bg-sidebar-accent px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">
                    账户
                  </span>
                </span>
                <span className="block truncate text-xs font-normal text-sidebar-foreground/60">
                  {email}
                </span>
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
      </TooltipHint>
      <DropdownMenuContent side="top" align="start" sideOffset={8} collisionPadding={12} className="w-72 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-2xl border-0 p-2 shadow-lg">
        <DropdownMenuGroup className="md:hidden">
          <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-2"><Palette className="size-4" />主题</DropdownMenuLabel>
          <ThemeOptions compact />
        </DropdownMenuGroup>
        <DropdownMenuGroup className="hidden md:block">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-lg px-3 py-2.5">
              <Palette />
              主题
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={8} className="w-48 rounded-2xl p-2">
              <DropdownMenuGroup>
                <ThemeOptions />
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <form action={signOutUrl} method="post">
            <DropdownMenuItem
              asChild
              className="min-h-11 rounded-lg px-3 text-destructive focus:bg-destructive focus:text-white"
              onSelect={(e) => {
                // Radix 会在 click 里同步关闭菜单并卸载表单，导致浏览器来不及执行 submit 的默认行为。
                // 阻止默认关闭后手动提交表单。
                e.preventDefault();
                (e.currentTarget as HTMLElement).closest("form")?.requestSubmit();
              }}
            >
              <button type="submit" className="w-full">
                <LogOut data-icon="inline-start" />
                退出登录
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
