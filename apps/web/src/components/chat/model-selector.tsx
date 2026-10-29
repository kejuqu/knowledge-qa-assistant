"use client";

import { Button } from "@kqa/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@kqa/ui/components/dropdown-menu";
import { Bot, Check, ChevronDown } from "lucide-react";

export interface ChatModel {
  value: string;
  label: string;
}

interface ModelSelectorProps {
  models: ChatModel[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/** The composer model picker follows the shadcn Model Selector dropdown pattern. */
export function ModelSelector({ models, value, onValueChange, disabled }: ModelSelectorProps) {
  const selected = models.find((model) => model.value === value) ?? models[0];
  if (!selected) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 rounded-lg px-2 text-muted-foreground hover:text-foreground"
          aria-label="选择问答模型"
        >
          <Bot data-icon="inline-start" />
          <span className="max-w-40 truncate">{selected.label}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>问答模型</DropdownMenuLabel>
            {models.map((model) => (
              <DropdownMenuRadioItem key={model.value} value={model.value}>
                <Bot data-icon="inline-start" />
                <span className="flex-1">{model.label}</span>
                {model.value === value && <Check aria-hidden="true" />}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
