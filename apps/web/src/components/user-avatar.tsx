"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@kqa/ui/components/avatar";

export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "U";
  return <Avatar className={className}>
    <AvatarImage src={src ?? undefined} alt={`${name}的头像`} className="object-cover" />
    <AvatarFallback>{initial}</AvatarFallback>
  </Avatar>;
}
