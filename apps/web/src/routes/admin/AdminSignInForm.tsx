import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { adminCopy } from "@/routes/admin/copy";

/**
 * Admin sign-in: email/password only. No "create account" affordance — admin
 * accounts are pre-provisioned out-of-band (SQL), per the `data-model`
 * capability's "Admin status is granted out-of-band" requirement.
 */
export function AdminSignInForm() {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: authError } = await signInWithPassword(email, password);
      if (authError) setError(adminCopy.signInError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-4 text-left">
      <h2 className="text-lg font-medium">{adminCopy.signInTitle}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.emailLabel}
        <input
          type="email"
          className="rounded-md border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.passwordLabel}
        <input
          type="password"
          className="rounded-md border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {adminCopy.signInButton}
      </Button>
    </form>
  );
}
