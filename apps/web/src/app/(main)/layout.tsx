import { redirect } from "next/navigation";
import { getSessionUser } from "@kqa/auth/next";
import { BookOpenCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMobileOverlay,
  SidebarMobileTrigger,
  SidebarProvider,
  SidebarRail,
} from "@kqa/ui/components/sidebar";
import { ChatNavigation } from "@/components/chat/chat-navigation";
import { UserMenu } from "@/components/user-menu";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(AUTH_APP_URL + "/signin");

  return (
    <SidebarProvider className="app-shell">
      <Sidebar className="p-3.5">
        <SidebarHeader className="mb-6">
          <div className="mb-1 flex items-center gap-2.5 px-1.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <BookOpenCheck className="size-4" />
            </div>
            <span data-sidebar-label className="truncate font-semibold tracking-tight">知识问答助手</span>
          </div>
          <p data-sidebar-label className="truncate px-1.5 text-xs text-sidebar-foreground/60">{user.tenantName}</p>
        </SidebarHeader>
        <SidebarContent>
          <ChatNavigation />
        </SidebarContent>
        <SidebarFooter className="pt-3.5">
          <UserMenu name={user.name} email={user.email} signOutUrl={`${AUTH_APP_URL}/api/signout`} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarMobileOverlay />
      <SidebarMobileTrigger />
      <main className="min-w-0 flex-1 pt-16 md:pt-0">{children}</main>
    </SidebarProvider>
  );
}
