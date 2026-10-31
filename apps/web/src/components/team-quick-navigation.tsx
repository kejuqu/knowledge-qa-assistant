"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@kqa/ui/lib/utils";

const sections = [
  { id: "join-requests", label: "加入申请" },
  { id: "team-members", label: "团队成员" },
  { id: "employee-import", label: "批量导入员工", managerOnly: true },
  { id: "employee-api-keys", label: "员工导入 API Key", managerOnly: true },
];

export function TeamQuickNavigation({ canManage, ready }: { canManage: boolean; ready: boolean }) {
  const navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState("join-requests");

  useEffect(() => {
    if (!ready) return;
    const container = document.getElementById("main-content");
    if (!container) return;
    const targets = sections.filter((section) => !section.managerOnly || canManage)
      .map((section) => document.getElementById(section.id)).filter((element): element is HTMLElement => !!element);
    let frame = 0;
    const update = () => {
      const top = Math.max(container.getBoundingClientRect().top + 80,
        window.innerWidth < 1024 ? (navRef.current?.getBoundingClientRect().bottom ?? 0) + 32 : 0);
      const current = targets.find((target) => target.getBoundingClientRect().bottom > top);
      const atBottom = container.scrollHeight > container.clientHeight + 4
        && container.scrollHeight - container.scrollTop - container.clientHeight < 4;
      if (current) setActive(atBottom ? targets.at(-1)!.id : current.id);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    container.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(container);
    if (navRef.current) observer.observe(navRef.current);
    targets.forEach((target) => observer.observe(target));
    update();
    return () => { container.removeEventListener("scroll", onScroll); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [canManage, ready]);

  function jump(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    setActive(id);
    // Web Animations 可取消重播，同一块连续点击也会重新高亮；结束后恢复原样。
    target.getAnimations().forEach((animation) => animation.cancel());
    target.animate([
      { boxShadow: "0 0 0 2px var(--primary)", backgroundColor: "color-mix(in oklch, var(--primary) 16%, var(--card))" },
      { offset: 0.55, boxShadow: "0 0 0 2px var(--primary)", backgroundColor: "color-mix(in oklch, var(--primary) 10%, var(--card))" },
      { boxShadow: "0 0 0 0 transparent", backgroundColor: "var(--card)" },
    ], { duration: reducedMotion ? 900 : 2000, easing: "ease-out" });
  }

  return <nav ref={navRef} aria-label="团队管理快速导航" className="sticky top-0 z-10 rounded-xl bg-background py-3 lg:col-start-3 lg:row-start-1 lg:top-6 lg:z-auto lg:w-44 lg:justify-self-end lg:py-0">
    <p className="mb-3 hidden px-3 text-xs font-medium text-muted-foreground lg:block">快速导航</p>
    <ul className="flex flex-wrap gap-1 lg:flex-col lg:border-l lg:pl-3">
      {sections.filter((section) => !section.managerOnly || canManage).map((section) => <li key={section.id}>
        <a href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined}
          className={cn("block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === section.id && "font-medium text-primary")}
          onClick={(event) => { event.preventDefault(); jump(section.id); }}>{section.label}</a>
      </li>)}
    </ul>
  </nav>;
}
