import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RecorderTokenManager } from "@/components/recorder-token-manager";
import { listRecorderTokens } from "@/features/auth/recorder-tokens";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RecorderTokensPage() {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    redirect("/login");
  }

  const tokens = await listRecorderTokens();

  return (
    <main className="library-shell token-page">
      <nav className="library-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          Screenly
        </Link>
        <Link className="secondary-button" href="/library">
          Back to library
        </Link>
      </nav>

      <header className="library-heading">
        <div>
          <p className="eyebrow">Workspace settings</p>
          <h1>Recorder tokens</h1>
          <p className="page-description">
            Create a separate token for each Mac. Revoking one immediately
            blocks new uploads without affecting existing recordings.
          </p>
        </div>
      </header>

      <RecorderTokenManager initialTokens={tokens} />
    </main>
  );
}
