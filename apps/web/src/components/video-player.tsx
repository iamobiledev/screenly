"use client";

import { useRef, useState } from "react";

const PLAYBACK_RATES = [1, 1.5, 2] as const;

type VideoPlayerProps = {
  posterUrl: string | null;
  title: string;
  videoUrl: string;
};

export function VideoPlayer({
  posterUrl,
  title,
  videoUrl,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  function changePlaybackRate(rate: number) {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setPlaybackRate(rate);
  }

  return (
    <div className="player-shell">
      <video
        ref={videoRef}
        aria-label={title}
        controls
        playsInline
        poster={posterUrl ?? undefined}
        preload="metadata"
        src={videoUrl}
      />
      <div className="player-toolbar" aria-label="Playback speed">
        <span>Speed</span>
        {PLAYBACK_RATES.map((rate) => (
          <button
            aria-pressed={playbackRate === rate}
            className={playbackRate === rate ? "is-active" : undefined}
            key={rate}
            type="button"
            onClick={() => changePlaybackRate(rate)}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
  );
}
