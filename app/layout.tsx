import type { Metadata } from "next";
import "./globals.css";
import BottomNavVisibility from "./components/BottomNavVisibility";

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
      <body suppressHydrationWarning>
        {children}
        <BottomNavVisibility />
      </body>
    </html>
  );
}