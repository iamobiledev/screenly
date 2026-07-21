import Link from "next/link";

import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authentication = await getCookieSessionAuth();

  return (
    <main className="home-shell">
      <nav className="home-nav">
        <div className="brand">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </div>
        <div className="home-nav-actions">
          <Link href="/download">Download</Link>
          <span className="internal-pill">Internal preview</span>
          {authentication ? (
            <Link className="nav-cta" href="/library">
              Open library
            </Link>
          ) : (
            <Link className="nav-cta" href="/login">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <section className="home-hero">
        <p className="eyebrow">Share context without scheduling a meeting</p>
        <h1>Record it. Share it. Keep moving.</h1>
        <p className="home-subtitle">
          A fast, private screen recorder built for your team. The recording
          link is ready before the upload finishes.
        </p>
        <div className="home-actions">
          <Link className="primary-button" href="/v/demo1234">
            Watch demo
            <span aria-hidden="true">→</span>
          </Link>
          <Link className="secondary-button" href="/download">
            Download for Mac
          </Link>
        </div>
      </section>

      <section className="flow-card" aria-label="Recording workflow">
        {[
          ["01", "Record", "Capture a screen, window, or selected area."],
          ["02", "Upload", "The share link is copied immediately."],
          ["03", "Share", "Paste it into Slack and keep moving."],
        ].map(([number, title, description]) => (
          <div className="flow-step" key={number}>
            <span>{number}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
