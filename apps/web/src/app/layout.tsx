import type { Metadata } from "next";
import "@kqa/ui/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "企业知识问答助手",
  description: "基于企业知识库的 RAG 问答",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
