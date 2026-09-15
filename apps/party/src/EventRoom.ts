import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyMutation,
  defaultRoomState,
  GRACE_MS,
  requireFlowController,
  toStateMessage,
  type AnswerAckMessage,
  type ClientCommand,
  type ErrorMessage,
  type RoomQuestion,
  type RoomRole,
  type RoomState,
  type RoomStep,
} from "@quiz/shared";

/** Per-connection state, resolved once at connect time (event-room capability). */
interface ConnState {
  role: RoomRole;
  profileId: string;
  /** The caller's `participant.id` for this event, or `null` for an admin. */
  participantId: string | null;
}

/** Raw shape of a `step` row this DO reads from Postgres. */
interface StepRow {
  id: string;
  position: number;
  timed: boolean;
  countdown_seconds: number;
}

const UNAUTHORIZED_CLOSE_CODE = 4001;

function isAnswerSubmitPayload(payload: unknown): payload is { stepId: string; optionId: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).stepId === "string" &&
    typeof (payload as Record<string, unknown>).optionId === "string"
  );
}

/**
 * One Durable Object instance per event id (MILESTONE-01 baseline).
 *
 * MILESTONE-05: connection auth, role, state, snapshot, broadcast,
 * `mc:claim_control`. MILESTONE-07: the game-flow commands (`mc:start`,
 * `mc:advance`, `mc:lock`, timer-driven auto-lock via a DO alarm) and
 * `answer:submit`. See openspec/changes/live-mcq-round/design.md.
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
    // Accepted answers (design.md D5) — local to this DO, never Postgres
    // until MILESTONE-08's mc:reveal flush. `id` (SQLite's own autoincrement)
    // doubles as the monotonic receipt_seq (FR-045); the unique constraint is
    // the storage-level backstop for "at most one answer per participant per
    // step" (FR-042), alongside the application-level check in
    // handleAnswerSubmit.
    void this.sql`create table if not exists local_answer (
      id integer primary key autoincrement,
      step_id text not null,
      participant_id text not null,
      option_id text not null,
      submitted_at text not null,
      unique (step_id, participant_id)
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
  private async resolveRole(profileId: string): Promise<{ role: RoomRole; participantId: string | null }> {
    const supabase = this.getSupabase();

    const { data: profile, error: profileError } = await supabase
      .from("profile")
      .select("is_admin")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("profile not found");
    if (profile.is_admin) return { role: "admin", participantId: null };

    const { data: participant, error: participantError } = await supabase
      .from("participant")
      .select("id")
      .eq("event_id", this.name)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (participantError || !participant) throw new Error("no participant for this event");

    return { role: "player", participantId: participant.id as string };
  }

  /** Reads a step's MCQ content, minus the answer key (design.md D6). Null if not found. */
  private async fetchQuestion(stepId: string): Promise<RoomQuestion | null> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from("game_mcq")
      .select("question_text, options")
      .eq("step_id", stepId)
      .maybeSingle();
    if (error || !data) return null;
    return { text: data.question_text as string, options: data.options as RoomQuestion["options"] };
  }

  private toRoomStep(row: StepRow, status: RoomStep["status"], timerStartedAt: string | null): RoomStep {
    return {
      id: row.id,
      position: row.position,
      timed: row.timed,
      countdownSeconds: row.countdown_seconds,
      status,
      timerStartedAt,
    };
  }

  /**
   * Schedules (or clears) the Durable Object's one alarm for the current
   * step's expiry (design.md D3). Setting a new alarm always replaces any
   * previously pending one — this is how a superseding `mc:advance`/explicit
   * `mc:lock` naturally cancels a stale alarm with no extra bookkeeping.
   */
  private scheduleAlarmForCurrentStep(): void {
    const step = this.#state.step;
    if (!step || !step.timed || step.status !== "active" || !step.timerStartedAt) {
      void this.ctx.storage.deleteAlarm();
      return;
    }
    const expiryMs = Date.parse(step.timerStartedAt) + step.countdownSeconds * 1000 + GRACE_MS;
    void this.ctx.storage.setAlarm(expiryMs);
  }

  /**
   * Locks the current step if (and only if) it is still `active` — the
   * shared idempotent core for both the explicit `mc:lock` command and the
   * alarm-driven auto-lock at expiry (design.md D3).
   */
  private lockCurrentStepIfActive(): void {
    const { state: nextState, changed } = applyMutation(this.#state, (current) => {
      if (!current.step || current.step.status !== "active") return current;
      return { ...current, step: { ...current.step, status: "locked" } };
    });
    this.#state = nextState;

    if (changed) {
      this.persistState();
      void this.ctx.storage.deleteAlarm();
      this.broadcastState();
    }
  }

  override async onAlarm(): Promise<void> {
    this.lockCurrentStepIfActive();
  }

  override async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    try {
      const profileId = await this.verifyToken(ctx.request);
      const { role, participantId } = await this.resolveRole(profileId);
      connection.setState({ role, profileId, participantId });
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
      case "mc:start":
        void this.handleMcStart(connection);
        return;
      case "mc:advance":
        void this.handleMcAdvance(connection);
        return;
      case "mc:lock":
        this.handleMcLock(connection);
        return;
      case "answer:submit":
        void this.handleAnswerSubmit(connection, command.payload);
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
   * *other* flow-control command uses (design.md D1, MILESTONE-07).
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

  private requireController(connection: Connection<ConnState>): boolean {
    const state = connection.state;
    if (!state || state.role !== "admin" || !requireFlowController(this.#state, state.profileId)) {
      this.sendError(connection, "forbidden", "Only the current flow controller may do this");
      return false;
    }
    return true;
  }

  /** `mc:start` (design.md D2/D9) — the DO's first real Postgres write. */
  private async handleMcStart(connection: Connection<ConnState>): Promise<void> {
    if (!this.requireController(connection)) return;

    if (this.#state.eventStatus !== "draft") {
      this.sendError(connection, "not_draft", "This event has already started");
      return;
    }

    const supabase = this.getSupabase();
    const { data: steps, error: stepsError } = await supabase
      .from("step")
      .select("id, position, timed, countdown_seconds")
      .eq("event_id", this.name)
      .order("position", { ascending: true })
      .limit(1);
    if (stepsError || !steps || steps.length === 0) {
      this.sendError(connection, "no_steps", "This event has no steps to start");
      return;
    }
    const firstStep = steps[0] as StepRow;

    const seasonYear = new Date().getUTCFullYear();
    const { data: updatedEvent, error: updateError } = await supabase
      .from("event")
      .update({ status: "live", season_year: seasonYear })
      .eq("id", this.name)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (updateError || !updatedEvent) {
      this.sendError(connection, "not_draft", "This event could not be started");
      return;
    }

    const timerStartedAt = new Date().toISOString();
    const question = await this.fetchQuestion(firstStep.id);

    const { state: nextState, changed } = applyMutation(this.#state, (current) => ({
      ...current,
      eventStatus: "live",
      step: this.toRoomStep(firstStep, "active", timerStartedAt),
      question,
    }));
    this.#state = nextState;

    if (changed) {
      this.persistState();
      this.scheduleAlarmForCurrentStep();
      this.broadcastState();
    }
  }

  /** `mc:advance` (design.md D9) — moves to the next step, or rejects on the last one. */
  private async handleMcAdvance(connection: Connection<ConnState>): Promise<void> {
    if (!this.requireController(connection)) return;

    const currentStep = this.#state.step;
    if (this.#state.eventStatus !== "live" || !currentStep) {
      this.sendError(connection, "not_live", "This event is not currently live");
      return;
    }

    const supabase = this.getSupabase();
    const { data: nextStepRow, error } = await supabase
      .from("step")
      .select("id, position, timed, countdown_seconds")
      .eq("event_id", this.name)
      .eq("position", currentStep.position + 1)
      .maybeSingle();
    if (error) {
      this.sendError(connection, "no_next_step", "Could not determine the next step");
      return;
    }
    if (!nextStepRow) {
      this.sendError(connection, "no_next_step", "This is the last step");
      return;
    }

    const timerStartedAt = new Date().toISOString();
    const question = await this.fetchQuestion((nextStepRow as StepRow).id);

    const { state: nextState, changed } = applyMutation(this.#state, (current) => {
      // Stale/idempotent guard: only advance if the step we computed a
      // successor for is still the one that's active.
      if (!current.step || current.step.id !== currentStep.id) return current;
      return {
        ...current,
        step: this.toRoomStep(nextStepRow as StepRow, "active", timerStartedAt),
        question,
      };
    });
    this.#state = nextState;

    if (changed) {
      this.persistState();
      this.scheduleAlarmForCurrentStep();
      this.broadcastState();
    }
  }

  /** `mc:lock` — explicit lock, sharing the same idempotent core as the alarm-driven one. */
  private handleMcLock(connection: Connection<ConnState>): void {
    if (!this.requireController(connection)) return;
    this.lockCurrentStepIfActive();
  }

  /** `answer:submit` (design.md D4/D5/D7). */
  private async handleAnswerSubmit(connection: Connection<ConnState>, payload: unknown): Promise<void> {
    const callerState = connection.state;
    if (!callerState || callerState.role !== "player" || !callerState.participantId) {
      this.sendError(connection, "forbidden", "Only a player may submit an answer");
      return;
    }
    if (!isAnswerSubmitPayload(payload)) {
      this.sendError(connection, "invalid_message", "answer:submit requires stepId and optionId");
      return;
    }
    const { stepId, optionId } = payload;

    const step = this.#state.step;
    if (!step || step.id !== stepId || step.status !== "active") {
      this.sendError(connection, "not_active", "This step is not currently accepting answers");
      return;
    }

    // The real hard-lock enforcement (design.md D4) — checked fresh here,
    // independent of whether the alarm has flipped `status` to `locked` yet.
    if (step.timed && step.timerStartedAt) {
      const expiryMs = Date.parse(step.timerStartedAt) + step.countdownSeconds * 1000 + GRACE_MS;
      if (Date.now() > expiryMs) {
        this.sendError(connection, "too_late", "The answer window for this step has closed");
        return;
      }
    }

    try {
      void this.sql`insert into local_answer (step_id, participant_id, option_id, submitted_at)
        values (${stepId}, ${callerState.participantId}, ${optionId}, ${new Date().toISOString()})`;
    } catch {
      this.sendError(connection, "already_answered", "You have already answered this step");
      return;
    }

    const ack: AnswerAckMessage = { type: "answer_ack", stepId, optionId };
    connection.send(JSON.stringify(ack));
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
