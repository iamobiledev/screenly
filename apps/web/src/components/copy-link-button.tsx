"use client";

import { useState } from "react";

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <button className="secondary-button" type="button" onClick={copyLink}>
      <LinkIcon />
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path
        d="M10.6 13.4a3 3 0 0 0 4.24 0l3.54-3.54a3 3 0 1 0-4.24-4.24L12.1 7.66m1.3 2.94a3 3 0 0 0-4.24 0l-3.54 3.54a3 3 0 1 0 4.24 4.24l2.04-2.04"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
