import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { PlayerCopy } from "@/routes/player/copy";

export type Mode = "anonymous" | "create-account" | "sign-in";

export interface PendingJoin {
  displayName: string;
  /** `undefined` for `sign-in` — a returning identity already consented once. */
  over16Ack?: boolean;
  marketingConsent?: boolean;
}

interface Props {
  copy: PlayerCopy;
  onIdentityReady: (pending: PendingJoin) => void;
  onNeedsEmailConfirmation: () => void;
}

/** Identity choice (FR-002/FR-003) + age/legal/marketing consent gate (FR-005/006/007). */
export function IdentityStep({ copy, onIdentityReady, onNeedsEmailConfirmation }: Props) {
  const { signInAnonymously, signUpWithPassword, signInWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("anonymous");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [over16, setOver16] = useState(false);
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConsent = mode === "anonymous" || mode === "create-account";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (needsConsent && !(over16 && acceptedTos)) {
      setError(copy.consentRequired);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "anonymous") {
        const { error: authError } = await signInAnonymously();
        if (authError) {
          setError(authError.message);
          return;
        }
        onIdentityReady({ displayName, over16Ack: true, marketingConsent: false });
        return;
      }

      if (mode === "create-account") {
        const { error: authError, session } = await signUpWithPassword(email, password);
        if (authError) {
          setError(authError.message);
          return;
        }
        if (!session) {
          onNeedsEmailConfirmation();
          return;
        }
        onIdentityReady({ displayName, over16Ack: true, marketingConsent });
        return;
      }

      // sign-in
      const { error: authError } = await signInWithPassword(email, password);
      if (authError) {
        setError(authError.message);
        return;
      }
      onIdentityReady({ displayName });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4 text-left">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{copy.identityChooseMode}</legend>
        <div className="flex gap-2">
          {(["anonymous", "create-account", "sign-in"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? "default" : "outline"}
              size="sm"
              onClick={() => setMode(m)}
            >
              {m === "anonymous" ? copy.modeAnonymous : m === "create-account" ? copy.modeCreateAccount : copy.modeSignIn}
            </Button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        {copy.displayNameLabel}
        <input
          className="rounded-md border px-3 py-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
        />
      </label>

      {mode !== "anonymous" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {copy.emailLabel}
            <input
              type="email"
              className="rounded-md border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {copy.passwordLabel}
            <input
              type="password"
              className="rounded-md border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        </>
      )}

      {needsConsent && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={over16} onChange={(e) => setOver16(e.target.checked)} />
            {copy.over16Label}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={acceptedTos}
              onChange={(e) => setAcceptedTos(e.target.checked)}
            />
            {copy.tosLabel}
          </label>
          <p className="text-muted-foreground pl-6 text-xs">
            <Link to="/legal/terms" target="_blank" rel="noreferrer" className="underline">
              {copy.termsLinkText}
            </Link>
            {" · "}
            <Link to="/legal/privacy" target="_blank" rel="noreferrer" className="underline">
              {copy.privacyLinkText}
            </Link>
          </p>
          {mode === "create-account" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
              {copy.marketingLabel}
            </label>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {mode === "sign-in" ? copy.signInButton : copy.continueButton}
      </Button>
    </form>
  );
}
