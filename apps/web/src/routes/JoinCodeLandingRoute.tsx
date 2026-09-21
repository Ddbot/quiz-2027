import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getPlayerCopy } from "@/routes/player/copy";

/**
 * Root landing page (FR-001: the join code must be reachable "by manual
 * entry", not only via a QR-encoded `/e/:code` link). No event is resolved
 * yet here, so player copy defaults to French, same convention as
 * PlayerRoute's pre-resolution states.
 */
export function JoinCodeLandingRoute() {
  const copy = getPlayerCopy(null);
  const { session } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    navigate(`/e/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <p className="text-muted-foreground">{copy.landingIntro}</p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm">
          {copy.joinCodeInputLabel}
          <input
            className="rounded-md border px-3 py-2 text-center font-mono text-lg tracking-widest uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            required
          />
        </label>
        <Button type="submit">{copy.landingJoinButton}</Button>
      </form>

      <Link to="/admin" className="text-muted-foreground text-sm underline">
        {copy.landingAdminLink}
      </Link>

      {session && (
        <Link to="/account" className="text-muted-foreground text-sm underline">
          {copy.accountLink}
        </Link>
      )}
    </main>
  );
}
