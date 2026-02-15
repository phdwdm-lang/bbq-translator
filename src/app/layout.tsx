import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "../components/common/ClientProviders";

export const metadata: Metadata = {
  title: "Manga Translator",
  description: "Black-and-white manga style UI for manga translation",
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
