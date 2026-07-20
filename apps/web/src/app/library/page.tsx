import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LibraryNav } from "@/components/library-nav";
import { VideoCard } from "@/components/video-card";
import { listLibraryVideos } from "@/features/videos/library-service";
import {
  getSessionAuth,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import { listUserWorkspaces } from "@/features/auth/users";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const authentication = await getSessionAuth(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!authentication) {
    redirect("/login");
  }

  const rawQuery = (await searchParams).q;
  const query = typeof rawQuery === "string" ? rawQuery.slice(0, 120) : "";
  const [videos, workspaces] = await Promise.all([
    listLibraryVideos(authentication.workspace.id, query),
    listUserWorkspaces(authentication.user.id),
  ]);

  return (
    <main className="library-shell">
      <LibraryNav
        activeWorkspace={authentication.workspace}
        workspaces={workspaces}
      />

      <header className="library-heading">
        <div>
          <p className="eyebrow">{authentication.workspace.name}</p>
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
