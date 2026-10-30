"use client";

import { createContext, useContext } from "react";

type TenantRole = "admin" | "member";
const TenantRoleContext = createContext<TenantRole>("member");

export function TenantRoleProvider({ role, children }: { role: TenantRole; children: React.ReactNode }) {
  return <TenantRoleContext.Provider value={role}>{children}</TenantRoleContext.Provider>;
}

export function useTenantRole() {
  return useContext(TenantRoleContext);
}
