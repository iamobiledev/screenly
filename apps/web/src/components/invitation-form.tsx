"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function InvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/auth/invitations/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      },
    );

    if (!response.ok) {
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      setError(
        result.error?.message ?? "The invitation could not be accepted.",
      );
      setIsSubmitting(false);
      return;
    }

    router.replace("/library");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="username">Username</label>
      <input
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        id="username"
        name="username"
        placeholder="Choose or enter your username"
        required
      />
      <label htmlFor="password">Password</label>
      <input
        autoComplete="current-password"
        id="password"
        minLength={12}
        name="password"
        placeholder="At least 12 characters"
        required
        type="password"
      />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Joining…" : "Join workspace"}
      </button>
    </form>
  );
}
