import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyMutation,
  defaultRoomState,
  GRACE_MS,
  rankByTotal,
  requireFlowController,
  scoreStep,
  toStateMessage,
  type AnswerAckMessage,
  type ClientCommand,
  type ErrorMessage,
  type OwnResultMessage,
  type ParticipantStepResult,
  type RankingsMessage,
  type RoomQuestion,
  type RoomRole,
  type RoomState,
  type RoomStep,
  type StepResultsMessage,
} from "@quiz/shared";

import { withRetry } from "./retry.js";

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

/** A step's scoring configuration, read fresh at reveal time (never stored in `RoomState`). */
interface RevealConfig {
  pointsCorrect: number;
  teamAwardPoints: number;
  correctOptionId: string;
}

/** An event's full participant roster, as scoring/rankings need it. */
interface RosterParticipant {
  id: string;
  team_id: string | null;
  display_name: string;
}

/** Raw shape of a `local_answer` row this DO reads from its own SQLite. */
interface LocalAnswerRow {
  id: number;
  participant_id: string;
  option_id: string;
  submitted_at: string;
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
      case "mc:reveal":
        void this.handleMcReveal(connection);
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

  /** Reads a step's scoring config, never exposed via `RoomState`/broadcast. Null if not found. */
  private async fetchRevealConfig(stepId: string): Promise<RevealConfig | null> {
    const supabase = this.getSupabase();
    const { data: stepRow, error: stepError } = await supabase
      .from("step")
      .select("points_correct, team_award_points")
      .eq("id", stepId)
      .maybeSingle();
    if (stepError || !stepRow) return null;

    const { data: mcqRow, error: mcqError } = await supabase
      .from("game_mcq")
      .select("correct_option_id")
      .eq("step_id", stepId)
      .maybeSingle();
    if (mcqError || !mcqRow) return null;

    return {
      pointsCorrect: stepRow.points_correct as number,
      teamAwardPoints: stepRow.team_award_points as number,
      correctOptionId: mcqRow.correct_option_id as string,
    };
  }

  /** The event's full current participant roster — every participant, not only submitters. */
  private async fetchRoster(): Promise<RosterParticipant[]> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from("participant")
      .select("id, team_id, display_name")
      .eq("event_id", this.name);
    if (error || !data) return [];
    return data as RosterParticipant[];
  }

  private fetchLocalAnswers(stepId: string): LocalAnswerRow[] {
    return this.sql<LocalAnswerRow>`select id, participant_id, option_id, submitted_at
      from local_answer where step_id = ${stepId}`;
  }

  /**
   * The event's cumulative individual/team rankings (design.md D5), recomputed
   * fresh from every `step_result_participant`/`step_result_team` row so far
   * — correct even after a DO restart, since Postgres is already the source
   * of truth for every already-revealed step.
   */
  private async computeRankings(roster: RosterParticipant[]): Promise<RankingsMessage> {
    const supabase = this.getSupabase();

    const { data: stepRows } = await supabase.from("step").select("id").eq("event_id", this.name);
    const stepIds = (stepRows ?? []).map((s) => s.id as string);

    const individualTotals = new Map<string, number>();
    const teamTotals = new Map<string, number>();
    if (stepIds.length > 0) {
      const { data: prRows } = await supabase
        .from("step_result_participant")
        .select("participant_id, points")
        .in("step_id", stepIds);
      for (const row of prRows ?? []) {
        const participantId = row.participant_id as string;
        individualTotals.set(participantId, (individualTotals.get(participantId) ?? 0) + (row.points as number));
      }

      const { data: trRows } = await supabase
        .from("step_result_team")
        .select("team_id, awarded_points")
        .in("step_id", stepIds);
      for (const row of trRows ?? []) {
        const teamId = row.team_id as string;
        teamTotals.set(teamId, (teamTotals.get(teamId) ?? 0) + (row.awarded_points as number));
      }
    }

    const { data: teamRows } = await supabase
      .from("team")
      .select("id, name")
      .eq("event_id", this.name)
      .eq("dissolved", false);

    const individualRanked = rankByTotal(roster.map((p) => ({ id: p.id, total: individualTotals.get(p.id) ?? 0 })));
    const teamRanked = rankByTotal(
      (teamRows ?? []).map((t) => ({ id: t.id as string, total: teamTotals.get(t.id as string) ?? 0 })),
    );
    const displayNameById = new Map(roster.map((p) => [p.id, p.display_name]));
    const teamNameById = new Map((teamRows ?? []).map((t) => [t.id as string, t.name as string]));

    return {
      type: "rankings",
      individuals: individualRanked.map((r) => ({
        participantId: r.id,
        displayName: displayNameById.get(r.id) ?? "",
        total: r.total,
        rank: r.rank,
      })),
      teams: teamRanked.map((r) => ({
        teamId: r.id,
        name: teamNameById.get(r.id) ?? "",
        total: r.total,
        rank: r.rank,
      })),
    };
  }

  /**
   * `mc:reveal` (design.md D2/D3/D4/D5) — scores the just-locked step,
   * persists to Postgres with retry, then transitions/broadcasts only once
   * that flush has actually succeeded (design.md D4: persist-then-transition).
   */
  private async handleMcReveal(connection: Connection<ConnState>): Promise<void> {
    if (!this.requireController(connection)) return;

    const step = this.#state.step;
    if (step && step.status === "revealed") return; // idempotent no-op — already done.
    if (!step || step.status !== "locked") {
      this.sendError(connection, "not_locked", "This step must be locked before it can be revealed");
      return;
    }

    const config = await this.fetchRevealConfig(step.id);
    if (!config) {
      this.sendError(connection, "reveal_failed", "Could not load this step's scoring configuration");
      return;
    }

    const roster = await this.fetchRoster();
    const localAnswers = this.fetchLocalAnswers(step.id);

    const scoringResult = scoreStep({
      timed: step.timed,
      pointsCorrect: config.pointsCorrect,
      teamAwardPoints: config.teamAwardPoints,
      correctOptionId: config.correctOptionId,
      answers: localAnswers.map((a) => ({
        participantId: a.participant_id,
        optionId: a.option_id,
        submittedAt: a.submitted_at,
        receiptSeq: a.id,
      })),
      participants: roster.map((p) => ({ id: p.id, teamId: p.team_id })),
    });
    const resultByParticipant = new Map(scoringResult.participants.map((r) => [r.participantId, r]));

    const answerRows = localAnswers.map((a) => {
      const result = resultByParticipant.get(a.participant_id) as ParticipantStepResult | undefined;
      return {
        step_id: step.id,
        participant_id: a.participant_id,
        option_id: a.option_id,
        submitted_at: a.submitted_at,
        receipt_seq: a.id,
        is_correct: result?.isCorrect ?? false,
        scored_points: result?.points ?? 0,
      };
    });
    const participantResultRows = scoringResult.participants.map((r) => ({
      step_id: step.id,
      participant_id: r.participantId,
      points: r.points,
    }));
    const teamResultRows = scoringResult.teams.map((t) => ({
      step_id: step.id,
      team_id: t.teamId,
      avg_score: t.avgScore,
      is_winner: t.isWinner,
      awarded_points: t.awardedPoints,
    }));

    const flushed = await withRetry(async () => {
      const supabase = this.getSupabase();
      if (answerRows.length > 0) {
        const { error } = await supabase.from("answer").upsert(answerRows, { onConflict: "step_id,participant_id" });
        if (error) throw new Error(error.message);
      }
      if (participantResultRows.length > 0) {
        const { error } = await supabase
          .from("step_result_participant")
          .upsert(participantResultRows, { onConflict: "step_id,participant_id" });
        if (error) throw new Error(error.message);
      }
      if (teamResultRows.length > 0) {
        const { error } = await supabase
          .from("step_result_team")
          .upsert(teamResultRows, { onConflict: "step_id,team_id" });
        if (error) throw new Error(error.message);
      }
      const { error: stepError } = await supabase.from("step").update({ status: "revealed" }).eq("id", step.id);
      if (stepError) throw new Error(stepError.message);
    });

    if (!flushed) {
      this.sendError(connection, "reveal_failed", "Could not persist this step's results — try again");
      return;
    }

    const { state: nextState, changed } = applyMutation(this.#state, (current) => {
      if (!current.step || current.step.id !== step.id || current.step.status !== "locked") return current;
      return { ...current, step: { ...current.step, status: "revealed" } };
    });
    this.#state = nextState;
    if (!changed) return; // stale guard — the step moved on some other way while this was in flight.

    this.persistState();
    this.broadcastState();

    const stepResults: StepResultsMessage = {
      type: "step_results",
      stepId: step.id,
      participants: scoringResult.participants,
      teams: scoringResult.teams,
    };
    this.broadcast(JSON.stringify(stepResults));

    const rankings = await this.computeRankings(roster);
    this.broadcast(JSON.stringify(rankings));

    for (const otherConnection of this.getConnections<ConnState>()) {
      const otherState = otherConnection.state;
      if (!otherState || otherState.role !== "player" || !otherState.participantId) continue;
      const own = resultByParticipant.get(otherState.participantId);
      const ownResult: OwnResultMessage = {
        type: "own_result",
        stepId: step.id,
        isCorrect: own?.isCorrect ?? false,
        points: own?.points ?? 0,
      };
      otherConnection.send(JSON.stringify(ownResult));
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
