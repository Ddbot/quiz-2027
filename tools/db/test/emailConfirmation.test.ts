// Email-confirmation flow (FR-003, design D3/D4) — proves the real behavior
// end to end through Mailpit's HTTP API, the same way a player's email
// client would, rather than mocking it. Needs `enable_confirmations = true`
// in supabase/config.toml (task 2.1).
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadLocalEnv } from "../src/env.js";
import { confirmEmailAndGetTokens, extractVerifyLink, findLatestEmailText } from "../src/mailpit.js";

loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!ANON_KEY) throw new Error("SUPABASE_ANON_KEY must be set — see tools/db/.env.example");

async function signUp(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: (await res.json()) as { session?: unknown } };
}

async function signInWithPassword(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: (await res.json()) as { error_code?: string; access_token?: string } };
}

describe("Email confirmation (FR-003)", () => {
  it("has no usable session until the emailed link is followed, then does", async () => {
    const email = `confirm-flow-${randomUUID()}@example.com`;
    const password = "correct horse battery staple";

    const signUpResult = await signUp(email, password);
    expect(signUpResult.status).toBe(200);
    expect(signUpResult.body.session ?? null).toBeNull();

    const preConfirmSignIn = await signInWithPassword(email, password);
    expect(preConfirmSignIn.status).toBe(400);
    expect(preConfirmSignIn.body.error_code).toBe("email_not_confirmed");

    const emailText = await findLatestEmailText(email);
    const verifyLink = extractVerifyLink(emailText);
    const tokens = await confirmEmailAndGetTokens(verifyLink);
    expect(tokens.accessToken).toBeTruthy();

    const postConfirmSignIn = await signInWithPassword(email, password);
    expect(postConfirmSignIn.status).toBe(200);
    expect(postConfirmSignIn.body.access_token).toBeTruthy();
  });
});
