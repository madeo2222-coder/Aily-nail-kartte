import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Naily AiDOL",
  description: "Naily AiDOL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}