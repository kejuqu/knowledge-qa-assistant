"use client";

import { Check, ChevronDown, LibraryBig } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kqa/ui/components/dropdown-menu";
import { InputGroupButton } from "@kqa/ui/components/input-group";
import { OverflowText } from "@kqa/ui/components/overflow-text";

export interface KnowledgeBaseDocument {
  id: string;
  filename: string;
  status: "pending" | "processing" | "ready" | "failed";
}

interface KnowledgeBaseSelectorProps {
  documents: KnowledgeBaseDocument[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function KnowledgeBaseSelector({
  documents,
  selectedIds,
  onSelectedIdsChange,
  disabled,
}: KnowledgeBaseSelectorProps) {
  const available = documents.filter((document) => document.status === "ready");
  const allSelected = selectedIds.length === 0;
  const label = allSelected ? "全部知识库" : `${selectedIds.length} 个知识库`;

  function toggle(id: string) {
    onSelectedIdsChange(
      selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          type="button"
          disabled={disabled}
          className="max-w-36 rounded-lg px-2 text-muted-foreground hover:text-foreground"
        >
          <LibraryBig data-icon="inline-start" />
          <span className="truncate">{label}</span>
          <ChevronDown data-icon="inline-end" />
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 border-0 shadow-lg">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal text-muted-foreground">选择知识库</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onSelectedIdsChange([]);
            }}
          >
            <span className="flex-1">全部知识库</span>
            {allSelected && <Check aria-hidden="true" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {available.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuGroup className="max-h-64 overflow-y-auto">
          {available.map((document) => (
            <DropdownMenuItem
              key={document.id}
              onSelect={(event) => {
                event.preventDefault();
                toggle(document.id);
              }}
            >
              <OverflowText text={document.filename} className="flex-1" />
              {selectedIds.includes(document.id) && <Check aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
          {available.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">没有已就绪的文档</p>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
