/*
 * @Author: xudandan xudandan@lattebank.com
 * @Date: 2026-02-28 15:45:29
 * @LastEditors: xudandan xudandan@lattebank.com
 * @LastEditTime: 2026-02-28 15:55:16
 * @FilePath: /ai-chat-baidu/src/app/layout.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude 聊天助手",
  description: "基于Next.js + Claude Sonnet的AI聊天应用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}