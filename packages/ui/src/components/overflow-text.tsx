"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/** 仅在文字实际溢出时展示完整内容，跟随容器宽度变化重新测量。 */
export function OverflowText({ text, className, side = "top" }: {
  text: string;
  className?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // 字体加载后文字宽度可能变化，但容器宽度未变。
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [text]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("block min-w-0 truncate", className)}>{text}</span>
      </TooltipTrigger>
      {overflowing && (
        <TooltipContent side={side} sideOffset={8} className="max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal break-words [overflow-wrap:anywhere]">
          {text}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
