import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@kqa/auth/next";
import { Button } from "@kqa/ui/components/button";
import { MessageSquare, FileText, Settings, BookOpenCheck, LogOut } from "lucide-react";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001";

const NAV = [
  { href: "/chat", label: "问答", icon: MessageSquare },
  { href: "/documents", label: "知识库", icon: FileText },
  { href: "/settings", label: "模型设置", icon: Settings },
];

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(AUTH_APP_URL + "/signin");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenCheck className="size-4" />
          </div>
          <span className="font-semibold">知识问答助手</span>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t pt-3">
          <div className="px-2 pb-2">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          {/* 退出登录：请求 auth 子应用清 cookie，再跳回登录页 */}
          <form action={AUTH_APP_URL + "/api/signout"} method="post">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <LogOut className="size-4" /> 退出登录
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
