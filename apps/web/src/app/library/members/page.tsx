import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LibraryNav } from "@/components/library-nav";
import { MemberManager } from "@/components/member-manager";
import { listWorkspaceAccess } from "@/features/auth/invitations";
import {
  canManageWorkspace,
  listUserWorkspaces,
} from "@/features/auth/users";
import { getSessionAuth, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const cookieStore = await cookies();
  const authentication = await getSessionAuth(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!authentication) {
    redirect("/login");
  }
  if (!canManageWorkspace(authentication.workspace.role)) {
    redirect("/library");
  }

  const [access, workspaces] = await Promise.all([
    listWorkspaceAccess(authentication.workspace.id),
    listUserWorkspaces(authentication.user.id),
  ]);

  return (
    <main className="library-shell token-page">
      <LibraryNav
        activeWorkspace={authentication.workspace}
        workspaces={workspaces}
      />
      <header className="library-heading">
        <div>
          <p className="eyebrow">{authentication.workspace.name}</p>
          <h1>Members</h1>
          <p className="page-description">
            Invite teammates and manage outstanding workspace invitations.
          </p>
        </div>
      </header>
      <MemberManager
        currentRole={authentication.workspace.role}
        invitations={access.invitations}
        members={access.members}
      />
    </main>
  );
}
