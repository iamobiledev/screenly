"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type RecorderToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function RecorderTokenManager({
  initialTokens,
}: {
  initialTokens: RecorderToken[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/library/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name") }),
    });

    if (!response.ok) {
      setError("Could not create the recorder token.");
      return;
    }

    const result = (await response.json()) as { token: string };
    setNewToken(result.token);
    event.currentTarget.reset();
    startTransition(() => router.refresh());
  }

  async function revoke(id: string) {
    setError(null);
    const response = await fetch(`/api/library/tokens/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Could not revoke the recorder token.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function copyToken() {
    if (newToken) {
      await navigator.clipboard.writeText(newToken);
    }
  }

  return (
    <div className={isPending ? "token-manager is-pending" : "token-manager"}>
      <form className="token-create-form" onSubmit={create}>
        <input
          aria-label="Recorder name"
          maxLength={120}
          name="name"
          placeholder="Recorder name, e.g. Alice’s Mac"
          required
        />
        <button className="primary-button" type="submit">
          Create token
        </button>
      </form>

      {newToken ? (
        <div className="new-token-panel" role="status">
          <div>
            <strong>Copy this token now</strong>
            <p>It cannot be shown again after you leave this page.</p>
          </div>
          <code>{newToken}</code>
          <button className="secondary-button" type="button" onClick={copyToken}>
            Copy token
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="token-list">
        {initialTokens.map((token) => (
          <div className="token-row" key={token.id}>
            <div>
              <strong>{token.name}</strong>
              <p>
                screenly_{token.tokenPrefix}_•••••••• · Created{" "}
                {formatDate(token.createdAt)}
              </p>
            </div>
            <div>
              <span>
                {token.lastUsedAt
                  ? `Used ${formatDate(token.lastUsedAt)}`
                  : "Never used"}
              </span>
              <button type="button" onClick={() => revoke(token.id)}>
                Revoke
              </button>
            </div>
          </div>
        ))}
        {initialTokens.length === 0 ? (
          <div className="empty-token-list">
            No recorder tokens yet. Create one for each Mac.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
