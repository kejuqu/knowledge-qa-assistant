import type { Metadata } from "next";
import "@kqa/ui/globals.css";

export const metadata: Metadata = {
  title: "登录 - 企业知识问答助手",
  description: "统一认证中心",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
