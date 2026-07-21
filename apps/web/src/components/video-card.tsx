"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { VideoViewers } from "@/components/video-viewers";

export type LibraryVideo = {
  id: string;
  slug: string;
  title: string;
  recorderName: string;
  ownerUserId: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number;
  createdAt: string;
};

export function VideoCard({
  video,
  currentUserId,
}: {
  video: LibraryVideo;
  currentUserId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [error, setError] = useState<string | null>(null);

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`/api/library/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      setError("Could not rename this video.");
      return;
    }

    setIsEditing(false);
    startTransition(() => router.refresh());
  }

  async function removeVideo() {
    setError(null);
    const response = await fetch(`/api/library/videos/${video.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Could not delete this video.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <article className={`video-card${isPending ? " is-pending" : ""}`}>
      <Link className="video-card-preview" href={`/v/${video.slug}`}>
        {video.thumbnailUrl ? (
          <span
            aria-hidden="true"
            className="video-card-image"
            style={{ backgroundImage: `url("${video.thumbnailUrl}")` }}
          />
        ) : (
          <span className="video-card-placeholder">
            <PlayIcon />
          </span>
        )}
        <span className={`status-badge status-${video.status}`}>
          {video.status}
        </span>
        {video.durationSeconds ? (
          <span className="duration-badge">
            {formatDuration(video.durationSeconds)}
          </span>
        ) : null}
      </Link>

      <div className="video-card-body">
        {isEditing ? (
          <form className="rename-form" onSubmit={saveTitle}>
            <input
              aria-label="Video title"
              maxLength={240}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div>
              <button type="submit">Save</button>
              <button
                type="button"
                onClick={() => {
                  setTitle(video.title);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <Link className="video-card-title" href={`/v/${video.slug}`}>
              {video.title}
            </Link>
            <p>
              {currentUserId && video.ownerUserId === currentUserId
                ? "You"
                : video.recorderName}{" "}
              · {formatDate(video.createdAt)}
            </p>
          </>
        )}

        {isConfirmingDelete ? (
          <div className="delete-confirmation">
            <span>Delete permanently?</span>
            <button type="button" onClick={removeVideo}>
              Delete
            </button>
            <button type="button" onClick={() => setIsConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="video-card-actions">
            <VideoViewers videoId={video.id} viewCount={video.viewCount} />
            <button type="button" onClick={() => setIsEditing(true)}>
              Rename
            </button>
            <button type="button" onClick={() => setIsConfirmingDelete(true)}>
              Delete
            </button>
          </div>
        )}
        {error ? <p className="card-error">{error}</p> : null}
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="30"
      viewBox="0 0 30 30"
      width="30"
    >
      <path d="m12 9 9 6-9 6V9Z" fill="currentColor" />
    </svg>
  );
}
