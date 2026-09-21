import { Link, useParams } from "react-router-dom";

import { adminCopy } from "@/routes/admin/copy";
import type { EventDashboard } from "@/routes/admin/types";
import { useEventDashboard } from "@/routes/admin/useEventDashboard";

/**
 * Per-event analytics dashboard (analytics capability, FR-072..FR-074): a
 * one-shot read, available regardless of `eventStatus` — meaningful before,
 * during, and long after an event, unlike `LiveControlPage`'s live,
 * WebSocket-driven surface (design.md D7).
 */
export function DashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const state = useEventDashboard(eventId);

  if (!eventId) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/admin/events/${eventId}`} className="text-sm underline">
        {adminCopy.dashboardBack}
      </Link>
      <h2 className="text-lg font-semibold">{adminCopy.dashboardTitle}</h2>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {adminCopy.dashboardLoadError}
        </p>
      )}

      {state.status === "loaded" && <DashboardContent dashboard={state.dashboard} />}
    </div>
  );
}

function DashboardContent({ dashboard }: { dashboard: EventDashboard }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap gap-6 text-sm">
        <p data-testid="dashboard-participant-count">
          {adminCopy.participantCountLabel} : {dashboard.participant_count}
        </p>
        <p data-testid="dashboard-completion-rate">
          {adminCopy.completionRateLabel} : {Math.round(dashboard.completion_rate * 100)}%
        </p>
        <p data-testid="dashboard-avg-response-time">
          {adminCopy.avgResponseTimeLabel} : {(dashboard.avg_response_ms / 1000).toFixed(1)} s
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{adminCopy.perQuestionTitle}</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pr-4">{adminCopy.questionPositionLabel}</th>
              <th className="pr-4">{adminCopy.correctLabel}</th>
              <th>{adminCopy.incorrectLabel}</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.per_question.map((q, index) => (
              <tr key={q.step_id} data-testid={`dashboard-question-${q.step_id}`}>
                <td className="pr-4">#{index + 1}</td>
                <td className="pr-4">{q.correct}</td>
                <td>{q.incorrect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{adminCopy.finalIndividualRankingsTitle}</h3>
        {dashboard.final_participants.length === 0 ? (
          <p className="text-muted-foreground text-sm">{adminCopy.noFinalRankingsYet}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pr-4">{adminCopy.rankLabel}</th>
                <th className="pr-4">{adminCopy.participantLabel}</th>
                <th>{adminCopy.pointsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.final_participants.map((p) => (
                <tr key={p.participant_id} data-testid={`dashboard-final-participant-${p.participant_id}`}>
                  <td className="pr-4">#{p.rank}</td>
                  <td className="pr-4">{p.display_name}</td>
                  <td>{p.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{adminCopy.finalTeamRankingsTitle}</h3>
        {dashboard.final_teams.length === 0 ? (
          <p className="text-muted-foreground text-sm">{adminCopy.noFinalRankingsYet}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pr-4">{adminCopy.rankLabel}</th>
                <th className="pr-4">{adminCopy.teamLabel}</th>
                <th>{adminCopy.pointsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.final_teams.map((t) => (
                <tr key={t.team_id} data-testid={`dashboard-final-team-${t.team_id}`}>
                  <td className="pr-4">#{t.rank}</td>
                  <td className="pr-4">{t.name}</td>
                  <td>{t.total_awarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
