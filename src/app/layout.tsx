import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "قاتي بزنس | منصة إدارة تجارة القات",
  description:
    "منصة SaaS متعددة المستأجرين لإدارة بيع وشراء القات، الموردين، العملاء، الديون والسندات.",
};

export const viewport: Viewport = {
  themeColor: "#06281c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
