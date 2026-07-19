import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { VideoCard } from "@/components/video-card";
import { listLibraryVideos } from "@/features/videos/library-service";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/login");
  }

  const rawQuery = (await searchParams).q;
  const query = typeof rawQuery === "string" ? rawQuery.slice(0, 120) : "";
  const videos = await listLibraryVideos(query);

  return (
    <main className="library-shell">
      <nav className="library-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </Link>
        <div className="library-nav-actions">
          <span>Team library</span>
          <Link href="/library/tokens">Recorder tokens</Link>
          <SignOutButton />
        </div>
      </nav>

      <header className="library-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Team recordings</h1>
        </div>
        <form className="search-form">
          <SearchIcon />
          <input
            aria-label="Search recordings"
            defaultValue={query}
            name="q"
            placeholder="Search by title"
            type="search"
          />
        </form>
      </header>

      {videos.length > 0 ? (
        <section className="video-grid" aria-label="Recordings">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </section>
      ) : (
        <section className="empty-library">
          <span>
            <SearchIcon />
          </span>
          <h2>{query ? "No matching recordings" : "No recordings yet"}</h2>
          <p>
            {query
              ? "Try a different title or clear your search."
              : "Recordings uploaded from the Mac app will appear here."}
          </p>
          {query ? (
            <Link className="secondary-button" href="/library">
              Clear search
            </Link>
          ) : null}
        </section>
      )}
    </main>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m16 16 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
