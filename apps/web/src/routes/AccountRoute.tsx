import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { getPlayerCopy } from "@/routes/player/copy";

/**
 * Account export/deletion for a signed-in account holder (privacy
 * capability, FR-077/FR-078). No event context is needed — export and
 * delete both operate on the caller's identity alone — so this page uses
 * the same French-default-until-resolved copy convention as
 * `JoinCodeLandingRoute` (design.md D4).
 */
export function AccountRoute() {
  const copy = getPlayerCopy(null);
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [exportedData, setExportedData] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert">{copy.accountSignedOutNotice}</p>
        <Link to="/" className="text-sm underline">
          {copy.accountBack}
        </Link>
      </main>
    );
  }

  async function handleExport() {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("export_my_data");
    if (rpcError) {
      setError(copy.accountActionError);
      return;
    }
    setExportedData(data);
  }

  async function handleDelete() {
    if (!window.confirm(copy.accountDeleteConfirm)) return;
    setError(null);
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) {
      setError(copy.accountActionError);
      return;
    }
    await signOut();
    navigate("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <Link to="/" className="text-sm underline">
        {copy.accountBack}
      </Link>
      <h1 className="text-2xl font-semibold">{copy.accountPageTitle}</h1>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Se déconnecter</h2>
        <Button type="button" onClick={() => {
          void signOut();
          navigate('/');
        }}>
          Se déconnecter
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{copy.accountExportTitle}</h2>
        <p className="text-muted-foreground text-sm">{copy.accountExportBody}</p>
        <Button type="button" onClick={() => void handleExport()}>
          {copy.accountExportButton}
        </Button>
        {exportedData !== null && (
          <pre
            data-testid="account-export-output"
            className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-left text-xs"
          >
            {JSON.stringify(exportedData, null, 2)}
          </pre>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{copy.accountDeleteTitle}</h2>
        <p className="text-muted-foreground text-sm">{copy.accountDeleteBody}</p>
        <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
          {copy.accountDeleteButton}
        </Button>
      </section>
    </main>
  );
}
