import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "../components/common/ClientProviders";

export const metadata: Metadata = {
  title: "BBQ Translator",
  description: "BBQ Translator — 一键将生肉漫画翻译为熟肉",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
