"use client";

import { useQuery } from "@tanstack/react-query";

export type Profile = { name: string; email: string; avatarUrl: string | null };

export function useProfile(initialData: Profile) {
  return useQuery<Profile>({
    queryKey: ["profile"], initialData, refetchOnWindowFocus: "always",
    queryFn: async () => {
      const response = await fetch("/api/profile");
      if (!response.ok) throw new Error("个人资料加载失败");
      return response.json();
    },
  });
}
