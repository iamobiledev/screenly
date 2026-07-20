"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { SignOutButton } from "@/components/sign-out-button";

type Workspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};

export function LibraryNav({
  activeWorkspace,
  workspaces,
}: {
  activeWorkspace: Workspace;
  workspaces: Workspace[];
}) {
  const router = useRouter();
  const [isSwitching, setIsSwitching] = useState(false);

  async function switchWorkspace(event: ChangeEvent<HTMLSelectElement>) {
    setIsSwitching(true);
    const response = await fetch("/api/auth/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: event.target.value }),
    });
    if (response.ok) {
      router.push("/library");
      router.refresh();
    } else {
      setIsSwitching(false);
    }
  }

  const canManage =
    activeWorkspace.role === "owner" || activeWorkspace.role === "admin";

  return (
    <nav className="library-nav">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <span />
        </span>
        Screenly
      </Link>
      <div className="library-nav-actions">
        {workspaces.length > 1 ? (
          <select
            aria-label="Active workspace"
            defaultValue={activeWorkspace.id}
            disabled={isSwitching}
            onChange={switchWorkspace}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        ) : (
          <span>{activeWorkspace.name}</span>
        )}
        {canManage ? <Link href="/library/tokens">Recorder tokens</Link> : null}
        {canManage ? <Link href="/library/members">Members</Link> : null}
        <SignOutButton />
      </div>
    </nav>
  );
}
