import { redirect } from "next/navigation";

import { LibraryNav } from "@/components/library-nav";
import { VideoCard } from "@/components/video-card";
import { listLibraryVideos } from "@/features/videos/library-service";
import { getCookieSessionAuth } from "@/lib/session";
import {
  canManageWorkspace,
  listUserWorkspaces,
} from "@/features/auth/users";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; mine?: string | string[] }>;
}) {
  const authentication = await getCookieSessionAuth();
  if (!authentication) {
    redirect("/login");
  }

  const { q: rawQuery, mine: rawMine } = await searchParams;
  const query = typeof rawQuery === "string" ? rawQuery.slice(0, 120) : "";
  const mineOnly = rawMine === "1";
  const [videos, workspaces] = await Promise.all([
    listLibraryVideos(
      authentication.workspace.id,
      query,
      mineOnly ? authentication.user.id : undefined,
    ),
    listUserWorkspaces(authentication.user.id),
  ]);
  const canManage = canManageWorkspace(authentication.workspace.role);

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
          <div className="filter-tabs" role="tablist" aria-label="Filter">
            <Link
              aria-current={mineOnly ? undefined : "page"}
              className={mineOnly ? "" : "is-active"}
              href={libraryHref(false, query)}
            >
              All recordings
            </Link>
            <Link
              aria-current={mineOnly ? "page" : undefined}
              className={mineOnly ? "is-active" : ""}
              href={libraryHref(true, query)}
            >
              My recordings
            </Link>
          </div>
        </div>
        <div className="library-heading-actions">
          {canManage ? (
            <Link className="secondary-button" href="/library/members">
              Invite teammates
            </Link>
          ) : null}
          <form className="search-form">
            <SearchIcon />
            <input
              aria-label="Search recordings"
              defaultValue={query}
              name="q"
              placeholder="Search by title"
              type="search"
            />
            {mineOnly ? <input name="mine" type="hidden" value="1" /> : null}
          </form>
        </div>
      </header>

      {videos.length > 0 ? (
        <section className="video-grid" aria-label="Recordings">
          {videos.map((video) => (
            <VideoCard
              currentUserId={authentication.user.id}
              key={video.id}
              video={video}
            />
          ))}
        </section>
      ) : (
        <section className="empty-library">
          <span>
            <SearchIcon />
          </span>
          <h2>
            {query
              ? "No matching recordings"
              : mineOnly
                ? "No recordings of yours yet"
                : "No recordings yet"}
          </h2>
          <p>
            {query
              ? "Try a different title or clear your search."
              : mineOnly
                ? "Recordings you upload from the Mac app while signed in will appear here."
                : "Recordings uploaded from the Mac app will appear here."}
          </p>
          {query || mineOnly ? (
            <Link className="secondary-button" href="/library">
              {query ? "Clear search" : "Show all recordings"}
            </Link>
          ) : null}
        </section>
      )}
    </main>
  );
}

function libraryHref(mine: boolean, query: string) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (mine) {
    params.set("mine", "1");
  }
  const search = params.toString();
  return search ? `/library?${search}` : "/library";
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
