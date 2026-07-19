"use client";

import { useEffect } from "react";

export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const storageKey = `screenly:viewed:${slug}`;

    try {
      if (window.sessionStorage.getItem(storageKey)) {
        return;
      }
      window.sessionStorage.setItem(storageKey, "true");
    } catch {
      // Privacy settings may disable session storage; tracking remains optional.
    }

    void fetch(`/api/videos/${encodeURIComponent(slug)}/views`, {
      method: "POST",
      keepalive: true,
    });
  }, [slug]);

  return null;
}
