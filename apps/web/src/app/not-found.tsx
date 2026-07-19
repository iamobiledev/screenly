import Link from "next/link";

export default function NotFound() {
  return (
    <main className="home-shell">
      <nav className="home-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </Link>
      </nav>
      <section className="home-hero">
        <p className="eyebrow">404 · Recording unavailable</p>
        <h1>This link has gone quiet.</h1>
        <p className="home-subtitle">
          The recording may have been deleted, or the link may be incorrect.
        </p>
        <div className="home-actions">
          <Link className="primary-button" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
