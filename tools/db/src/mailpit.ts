import { loadLocalEnv } from "./env.js";

loadLocalEnv();

function mailpitUrl(): string {
  return process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
}

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessageFull {
  Text: string;
}

/**
 * Polls Mailpit for the most recent message sent to `toEmail` (email delivery
 * is async even to the local catcher) and returns its plain-text body.
 */
export async function findLatestEmailText(toEmail: string): Promise<string> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const listRes = await fetch(`${mailpitUrl()}/api/v1/messages?limit=50`);
    const list = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    const match = list.messages.find((m) => m.To.some((to) => to.Address === toEmail));
    if (match) {
      const full = await fetch(`${mailpitUrl()}/api/v1/message/${match.ID}`);
      const body = (await full.json()) as MailpitMessageFull;
      return body.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No email found for ${toEmail} in Mailpit after polling`);
}

/** Supabase's confirmation email body reads "... ( https://.../auth/v1/verify?... )". */
export function extractVerifyLink(emailText: string): string {
  const match = emailText.match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/);
  if (!match) throw new Error(`No /auth/v1/verify link found in email text:\n${emailText}`);
  return match[0];
}

/**
 * Follows the verify link the way a browser would (GET, no auto-redirect —
 * Supabase issues a 303 whose Location fragment carries the session tokens),
 * and returns the resulting access/refresh tokens.
 */
export async function confirmEmailAndGetTokens(
  verifyUrl: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(verifyUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) {
    throw new Error(`Expected a redirect from ${verifyUrl}, got HTTP ${res.status}`);
  }

  const fragment = new URL(location).hash.replace(/^#/, "");
  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error(`Missing tokens in confirmation redirect: ${location}`);
  }
  return { accessToken, refreshToken };
}
