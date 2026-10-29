"use client";

import { useEffect, useState } from "react";
import { Button } from "@kqa/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kqa/ui/components/dropdown-menu";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@kqa/ui/lib/utils";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "kqa-theme";
const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Laptop }> = [
  { value: "system", label: "系统", icon: Laptop },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
];

function applyTheme(theme: Theme) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ThemeToggleButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>主题</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <ThemeOptions />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggleButton() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  const ActiveIcon = OPTIONS.find((option) => option.value === theme)?.icon ?? Laptop;

  return (
    <Button variant="ghost" size="icon" aria-label="切换主题" title="切换主题">
      <ActiveIcon data-icon="inline-start" />
    </Button>
  );
}

/** Shared by the theme submenu and the compact theme menu. */
export function ThemeOptions() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        const nextTheme = OPTIONS.find((option) => option.value === value)?.value;
        if (!nextTheme) return;
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
    >
      {OPTIONS.map((option) => (
        <DropdownMenuRadioItem
          key={option.value}
          value={option.value}
          className="rounded-lg px-3 py-2.5"
        >
          <span className="flex-1">{option.label}</span>
          <Check className={cn(theme !== option.value && "invisible")} aria-hidden="true" />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
