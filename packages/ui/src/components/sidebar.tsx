"use client";

import * as React from "react";
import { ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import { TooltipHint, TooltipProvider } from "./tooltip";
import { cn } from "../lib/utils";
import { Button } from "./button";

const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 180;
const MAX_WIDTH = 440;
const COLLAPSED_WIDTH = 68;

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  width: number;
  setWidth: (width: number) => void;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function SidebarProvider({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [width, setWidthState] = React.useState(DEFAULT_WIDTH);
  const [isMobile, setIsMobile] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const savedWidth = window.localStorage.getItem("kqa-sidebar-width");
    const parsedWidth = Number(savedWidth);
    if (savedWidth !== null && Number.isFinite(parsedWidth)) setWidthState(clampWidth(parsedWidth));
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const setWidth = React.useCallback((nextWidth: number) => {
    const safeWidth = clampWidth(nextWidth);
    setWidthState(safeWidth);
    window.localStorage.setItem("kqa-sidebar-width", String(safeWidth));
  }, []);

  const value = React.useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleSidebar: () => setCollapsed((current) => !current),
      width,
      setWidth,
      isMobile,
      mobileOpen,
      setMobileOpen,
    }),
    [collapsed, width, setWidth, isMobile, mobileOpen],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={300}>
        <div className={cn("flex min-h-svh w-full", className)} {...props}>
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context)
    throw new Error("Sidebar components must be used within SidebarProvider.");
  return context;
}

function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"aside">) {
  const { collapsed, width, isMobile, mobileOpen } = useSidebar();

  return (
    <aside
      data-slot="sidebar"
      data-state={!isMobile && collapsed ? "collapsed" : "expanded"}
      style={{ width: isMobile ? "min(18rem, 82vw)" : collapsed ? COLLAPSED_WIDTH : width }}
      className={cn(
        "group/sidebar relative flex h-svh shrink-0 flex-col overflow-visible bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200",
        isMobile && "fixed inset-y-0 left-0 z-50 shadow-xl",
        isMobile && !mobileOpen && "-translate-x-full",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={className} {...props} />;
}

/** A middle rail supports both pointer resizing and one-click collapse/expand. */
function SidebarRail({ className, ...props }: React.ComponentProps<"div">) {
  const { collapsed, setCollapsed, setWidth, toggleSidebar, width, isMobile } =
    useSidebar();
  const dragStart = React.useRef<{ x: number; width: number } | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, width };
    setCollapsed(false);
    setIsResizing(true);
  }

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setWidth(dragStart.current.width + event.clientX - dragStart.current.x);
  }

  function stopResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStart.current = null;
    setIsResizing(false);
  }

  if (isMobile) return null;

  return (
    <div
      data-slot="sidebar-rail"
      className={cn(
        "absolute inset-y-0 -right-1 z-20 w-3 cursor-col-resize touch-none",
        className,
      )}
      onPointerDown={startResize}
      onPointerMove={resize}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") setWidth(width - 16);
        if (event.key === "ArrowRight") setWidth(width + 16);
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧栏宽度"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      {...props}
    >
      <TooltipHint content={collapsed ? "展开侧栏" : "收起侧栏"} side="right">
        <button
          type="button"
          className={cn(
            "absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground shadow-md outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
            isResizing && "bg-sidebar-accent",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleSidebar}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <ChevronsLeft className="size-4" />
          )}
        </button>
      </TooltipHint>
    </div>
  );
}

function SidebarMobileTrigger() {
  const { isMobile, mobileOpen, setMobileOpen } = useSidebar();
  if (!isMobile || mobileOpen) return null;

  return (
    <button
      type="button"
      className="fixed left-3 top-3 z-[60] flex size-10 items-center justify-center rounded-xl bg-sidebar text-sidebar-foreground shadow-md"
      onClick={() => setMobileOpen(true)}
      aria-label="打开导航"
    >
      <Menu className="size-5" />
    </button>
  );
}

function SidebarMobileClose() {
  const { isMobile, setMobileOpen } = useSidebar();
  if (!isMobile) return null;
  return (
    <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-xl" onClick={() => setMobileOpen(false)} aria-label="关闭导航">
      <X data-icon="inline-start" />
    </Button>
  );
}

function SidebarMobileOverlay() {
  const { isMobile, mobileOpen, setMobileOpen } = useSidebar();
  if (!isMobile || !mobileOpen) return null;
  return <button type="button" className="fixed inset-0 z-40 bg-foreground/30" onClick={() => setMobileOpen(false)} aria-label="关闭导航遮罩" />;
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMobileOverlay,
  SidebarMobileTrigger,
  SidebarMobileClose,
  SidebarProvider,
  SidebarRail,
  useSidebar,
};
