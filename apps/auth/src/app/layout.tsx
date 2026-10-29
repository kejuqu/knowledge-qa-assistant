import type { Metadata } from "next";
import "@kqa/ui/globals.css";
import { ThemeScript } from "@kqa/ui/components/theme-script";

export const metadata: Metadata = {
  title: "登录 - 企业知识问答助手",
  description: "统一认证中心",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
