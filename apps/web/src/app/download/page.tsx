import Link from "next/link";

import { getMacRelease } from "@/lib/release";

export const dynamic = "force-dynamic";

export default function DownloadPage() {
  const release = getMacRelease();

  return (
    <main className="download-shell">
      <nav className="home-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </Link>
        <Link href="/library">Team library</Link>
      </nav>

      <section className="download-card">
        <div className="mac-app-icon">
          <span className="brand-mark">
            <span />
          </span>
        </div>
        <p className="eyebrow">Native macOS recorder</p>
        <h1>Record at the speed of thought.</h1>
        <p>
          Capture your screen, microphone, system audio, and webcam with a
          lightweight menu bar app built entirely with Swift and
          ScreenCaptureKit.
        </p>

        {release ? (
          <>
            <a className="primary-button" href={release.downloadURL}>
              Download Screenly for Mac
              <span aria-hidden="true">↓</span>
            </a>
            <div className="release-meta">
              Version {release.version} · macOS {release.minimumSystemVersion}+
              {release.sha256 ? (
                <code title={release.sha256}>
                  SHA-256 {release.sha256.slice(0, 12)}…
                </code>
              ) : null}
            </div>
          </>
        ) : (
          <div className="release-unavailable">
            The first signed Mac release has not been published yet.
          </div>
        )}
      </section>
    </main>
  );
}
