import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { adminCopy } from "@/routes/admin/copy";
import { useAdminAuth } from "@/routes/admin/useAdminAuth";
import { AdminSignInForm } from "@/routes/admin/AdminSignInForm";

/**
 * Gates admin console content to an identity with `profile.is_admin = true`
 * (event-authoring: "Only an admin identity can reach the console"). RLS is
 * the real boundary — this is UX only.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const state = useAdminAuth();
  const { signOut } = useAuth();

  if (state.status === "loading") return null;

  if (state.status === "signed-out") return <AdminSignInForm />;

  if (state.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p role="alert">
          <strong>{adminCopy.forbiddenTitle}</strong>
          <br />
          {adminCopy.forbiddenBody}
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          {adminCopy.signOutButton}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
