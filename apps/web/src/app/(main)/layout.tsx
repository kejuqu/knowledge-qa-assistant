import { redirect } from "next/navigation";
import { getSessionUser } from "@kqa/auth/next";
import { Button } from "@kqa/ui/components/button";
import { BookOpenCheck, LogOut } from "lucide-react";
import { ChatNavigation } from "@/components/chat/chat-navigation";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(AUTH_APP_URL + "/signin");

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_75%_-10%,rgba(142,224,190,0.22),transparent_32%),linear-gradient(135deg,rgba(248,255,251,0.95),rgba(238,250,244,0.78))]">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-emerald-950/10 bg-white/40 p-3.5 shadow-[10px_0_34px_-28px_rgba(13,76,54,0.45)] backdrop-blur-2xl">
        <div className="mb-1 flex items-center gap-2.5 px-1.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-9px_rgba(7,123,84,0.8)]">
            <BookOpenCheck className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">知识问答助手</span>
        </div>
        <p className="mb-6 px-1.5 text-xs text-muted-foreground">{user.tenantName}</p>
        <ChatNavigation />
        <div className="border-t border-emerald-950/10 pt-3.5">
          <div className="px-1.5 pb-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {user.name}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                  user.role === "admin"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {user.role === "admin" ? "管理员" : "成员"}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          {/* 退出登录：请求 auth 子应用清 cookie，再跳回登录页 */}
          <form action={AUTH_APP_URL + "/api/signout"} method="post">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 rounded-lg">
              <LogOut className="size-4" /> 退出登录
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
