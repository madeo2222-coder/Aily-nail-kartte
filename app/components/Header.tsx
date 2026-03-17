import Link from "next/link";

export default function Header() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="app-logo">
          Aily Nail Karte
        </Link>

        <nav className="app-nav">
          <Link href="/" className="app-nav-link">
            トップ
          </Link>
          <Link href="/list" className="app-nav-link">
            カルテ一覧
          </Link>
          <Link href="/customers/new" className="app-nav-link app-nav-link-primary">
            新規登録
          </Link>
        </nav>
      </div>
    </header>
  );
}