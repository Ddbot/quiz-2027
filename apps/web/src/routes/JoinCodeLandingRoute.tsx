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

  const trimmed = code.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    navigate(`/e/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="relative isolate mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-primary/15 absolute -top-24 -left-16 h-64 w-64 rounded-full blur-3xl" />
        <div className="bg-primary/10 absolute -right-20 -bottom-28 h-72 w-72 rounded-full blur-3xl" />
      </div>

      <div className="bg-card/80 ring-border/60 flex flex-col items-center gap-6 rounded-3xl p-8 text-center shadow-xl ring-1 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{copy.heading}</h1>
          <p className="text-muted-foreground text-pretty">{copy.landingIntro}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {copy.joinCodeInputLabel}
            </span>
            <input
              className="border-input bg-background focus-visible:border-primary focus-visible:ring-ring/40 h-14 w-full rounded-2xl border px-4 text-center font-mono text-2xl tracking-[0.4em] uppercase transition-[border-color,box-shadow] outline-none focus-visible:ring-4"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              required
            />
          </label>

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-2xl text-base shadow-sm transition-transform active:scale-[0.99]"
          >
            {copy.landingJoinButton}
          </Button>
        </form>
      </div>

      <nav className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm">
        <Link
          to="/admin"
          className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
        >
          {copy.landingAdminLink}
        </Link>

        {session && (
          <>
            <span aria-hidden className="bg-border h-1 w-1 rounded-full" />
            <Link
              to="/account"
              className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
            >
              {copy.accountLink}
            </Link>
          </>
        )}
      </nav>
    </main>
  );
}
