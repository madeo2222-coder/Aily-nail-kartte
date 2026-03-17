import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Naily AiDOL",
  description: "Nail salon management SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          background: "#f7f7f7",
          color: "#111",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            paddingBottom: "96px",
          }}
        >
          <header
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                maxWidth: 720,
                margin: "0 auto",
                padding: "16px",
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              Naily AiDOL
            </div>
          </header>

          <main
            style={{
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            {children}
          </main>
        </div>

        <nav
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            background: "#ffffff",
            borderTop: "1px solid #d1d5db",
          }}
        >
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
            }}
          >
            <NavItem href="/" label="ホーム" />
            <NavItem href="/customers" label="顧客" />
            <NavItem href="/visits" label="来店" />
            <NavItem href="/reservations" label="予約" />
            <NavItem href="/customers/intake" label="初回" />
          </div>
        </nav>
      </body>
    </html>
  );
}

function NavItem({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: "#111827",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 64,
        fontSize: 15,
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}