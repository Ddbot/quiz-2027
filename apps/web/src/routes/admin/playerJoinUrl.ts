/** Resolves the player-facing URL a join code's QR should encode. */
export function playerJoinUrl(joinCode: string): string {
  return `${window.location.origin}/e/${joinCode}`;
}
