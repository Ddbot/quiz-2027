import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyMutation,
  defaultRoomState,
  type ClientCommand,
  type ErrorMessage,
  type RoomRole,
  type RoomState,
  toStateMessage,
} from "@quiz/shared";

/** Per-connection state, resolved once at connect time (event-room capability). */
interface ConnState {
  role: RoomRole;
  profileId: string;
}

const UNAUTHORIZED_CLOSE_CODE = 4001;

/**
 * One Durable Object instance per event id (MILESTONE-01 baseline).
 *
 * MILESTONE-05: verifies each connection's Supabase JWT against the project's
 * JWKS endpoint, resolves a role (`player` | `admin`), holds the event's
 * authoritative state, snapshots it to every connect/reconnect, broadcasts it
 * on every change, and implements the flow-control lock's one real command,
 * `mc:claim_control`. See openspec/changes/event-room-core/design.md.
 */
export class EventRoom extends Server<Env> {
  #state: RoomState = defaultRoomState();
  #jwks: JWTVerifyGetKey | undefined;
  #supabase: SupabaseClient | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Durable Object SQLite (`this.sql`, provided by partyserver's Server
    // base class) is synchronous, so state loads to completion before this
    // constructor returns — no `blockConcurrencyWhile` needed to keep a
    // connection from being handled before state is ready.
    void this.sql`create table if not exists room_state (
      id integer primary key check (id = 0),
      data text not null
    )`;
    this.#state = this.loadState();
  }

  private loadState(): RoomState {
    const rows = this.sql<{ data: string }>`select data from room_state where id = 0`;
    const row = rows[0];
    if (!row) return defaultRoomState();
    try {
      return JSON.parse(row.data) as RoomState;
    } catch {
      return defaultRoomState();
    }
  }

  private persistState(): void {
    const data = JSON.stringify(this.#state);
    void this.sql`insert into room_state (id, data) values (0, ${data})
      on conflict (id) do update set data = excluded.data`;
  }

  private getJwks(): JWTVerifyGetKey {
    if (!this.#jwks) {
      const url = this.env.SUPABASE_JWKS_URL;
      if (!url) throw new Error("SUPABASE_JWKS_URL is not configured");
      this.#jwks = createRemoteJWKSet(new URL(url));
    }
    return this.#jwks;
  }

  private getSupabase(): SupabaseClient {
    if (!this.#supabase) {
      const url = this.env.SUPABASE_URL;
      const key = this.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Supabase service-role credentials are not configured");
      this.#supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.#supabase;
  }

  /** Verifies the connecting JWT and returns its `sub` (profile id). Throws on any failure. */
  private async verifyToken(request: Request): Promise<string> {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new Error("missing token");
    const { payload } = await jwtVerify(token, this.getJwks());
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new Error("token has no sub claim");
    }
    return payload.sub;
  }

  /**
   * Resolves `is_admin` and, for a non-admin, the caller's `participant` row
   * for this event (`this.name` is the event id — the room name). Throws if
   * the profile can't be found or a non-admin has no participant here.
   */
  private async resolveRole(profileId: string): Promise<RoomRole> {
    const supabase = this.getSupabase();

    const { data: profile, error: profileError } = await supabase
      .from("profile")
      .select("is_admin")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("profile not found");
    if (profile.is_admin) return "admin";

    const { data: participant, error: participantError } = await supabase
      .from("participant")
      .select("id")
      .eq("event_id", this.name)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (participantError || !participant) throw new Error("no participant for this event");

    return "player";
  }

  override async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    try {
      const profileId = await this.verifyToken(ctx.request);
      const role = await this.resolveRole(profileId);
      connection.setState({ role, profileId });
    } catch {
      // Fail closed: an invalid/missing token, an unresolvable profile, or a
      // non-admin with no participant for this event are all rejected the
      // same way — no state is ever shared with a connection that gets here.
      connection.close(UNAUTHORIZED_CLOSE_CODE, "unauthorized");
      return;
    }

    this.sendState(connection);
  }

  override onMessage(connection: Connection<ConnState>, message: WSMessage): void {
    if (typeof message !== "string") return;

    let command: ClientCommand;
    try {
      command = JSON.parse(message) as ClientCommand;
    } catch {
      this.sendError(connection, "invalid_message", "Message must be valid JSON");
      return;
    }

    switch (command.type) {
      case "mc:claim_control":
        this.handleClaimControl(connection);
        return;
      default:
        this.sendError(connection, "unknown_command", `Unknown command: ${command.type}`);
    }
  }

  /**
   * `mc:claim_control` (event-room: "Any admin may claim flow control").
   * Deliberately does NOT go through `requireFlowController` — per SPEC.md
   * §7.4.2 this is the takeover mechanism any admin can invoke, not gated to
   * the current controller. `requireFlowController` is the guard every
   * *other* flow-control command (arriving in later milestones) will use.
   */
  private handleClaimControl(connection: Connection<ConnState>): void {
    const state = connection.state;
    if (!state || state.role !== "admin") {
      this.sendError(connection, "forbidden", "Only an admin may claim flow control");
      return;
    }

    const { state: nextState, changed } = applyMutation(this.#state, (current) =>
      current.controllerId === state.profileId ? current : { ...current, controllerId: state.profileId },
    );
    this.#state = nextState;

    if (changed) {
      this.persistState();
      this.broadcastState();
    }
  }

  private sendState(connection: Connection<ConnState>): void {
    connection.send(JSON.stringify(toStateMessage(this.#state, new Date().toISOString())));
  }

  private broadcastState(): void {
    this.broadcast(JSON.stringify(toStateMessage(this.#state, new Date().toISOString())));
  }

  private sendError(connection: Connection<ConnState>, code: string, message: string): void {
    const payload: ErrorMessage = { type: "error", code, message };
    connection.send(JSON.stringify(payload));
  }
}
