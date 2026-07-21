"use client";

import { useEffect, useRef, useState } from "react";

type Viewer = {
  viewerName: string;
  watchCount: number;
  lastViewedAt: string;
};

type ViewersResponse = {
  viewCount: number;
  viewers: Viewer[];
};

export function VideoViewers({
  videoId,
  viewCount,
}: {
  videoId: string;
  viewCount: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<ViewersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function toggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (!nextOpen || data) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(`/api/library/videos/${videoId}/views`);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      setData((await response.json()) as ViewersResponse);
    } catch {
      setError("Could not load viewers.");
    }
  }

  const totalViews = data?.viewCount ?? viewCount;
  const namedViews =
    data?.viewers.reduce((sum, viewer) => sum + viewer.watchCount, 0) ?? 0;
  const anonymousViews = Math.max(0, totalViews - namedViews);

  return (
    <div className="video-viewers" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        className="viewers-toggle"
        title="See who watched"
        type="button"
        onClick={toggle}
      >
        <EyeIcon />
        {totalViews} {totalViews === 1 ? "view" : "views"}
      </button>

      {isOpen ? (
        <div className="viewers-popover" role="dialog" aria-label="Who watched">
          <p className="viewers-popover-title">Who watched</p>
          {error ? <p className="viewers-empty">{error}</p> : null}
          {!error && !data ? (
            <p className="viewers-empty">Loading…</p>
          ) : null}
          {data ? (
            <>
              {data.viewers.length > 0 ? (
                <ul className="viewers-list">
                  {data.viewers.map((viewer) => (
                    <li className="viewer-row" key={viewer.viewerName}>
                      <span className="viewer-avatar" aria-hidden="true">
                        {viewer.viewerName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="viewer-name">{viewer.viewerName}</span>
                      <span className="viewer-meta">
                        {viewer.watchCount > 1
                          ? `${viewer.watchCount}× · `
                          : ""}
                        {formatRelative(viewer.lastViewedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {anonymousViews > 0 ? (
                <p className="viewers-anonymous">
                  {anonymousViews} anonymous{" "}
                  {anonymousViews === 1 ? "view" : "views"}
                </p>
              ) : null}
              {data.viewers.length === 0 && anonymousViews === 0 ? (
                <p className="viewers-empty">No views yet.</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(value: string) {
  const elapsedMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(elapsedMs / 60_000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 24 24"
      width="14"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
