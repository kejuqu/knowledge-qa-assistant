"use client";

import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { hasPermission, type Access, type Permission } from "@kqa/auth/permissions";

const TenantRoleContext = createContext<Access>({ role: "member", permissions: [] });

export function TenantRoleProvider({ role, permissions, children }: Access & { children: React.ReactNode }) {
  const { data } = useQuery<Access & { status: string }>({
    queryKey: ["membership"],
    queryFn: async () => {
      const response = await fetch("/api/membership");
      if (!response.ok) throw new Error("成员状态加载失败");
      return response.json();
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });
  useEffect(() => {
    if (data && data.status !== "active") window.location.assign("/membership");
  }, [data]);
  return <TenantRoleContext.Provider value={data?.status === "active" ? data : { role, permissions }}>{children}</TenantRoleContext.Provider>;
}

export function useTenantRole() {
  return useContext(TenantRoleContext).role;
}

export function useTenantAccess() {
  return useContext(TenantRoleContext);
}

export function usePermission(permission: Permission) {
  return hasPermission(useTenantAccess(), permission);
}
