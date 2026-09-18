import { useEffect, useState } from "react";
import type { RoomDisplay, RoomQuestion, RoomRankings, RoomStepResults } from "@quiz/shared";

import type { ScreenCopy } from "@/routes/screenCopy";

interface Props {
  copy: ScreenCopy;
  display: RoomDisplay;
  question: RoomQuestion | null;
  stepResults: RoomStepResults | null;
  rankings: RoomRankings | null;
  mediaUrl: string | null;
  countdownTarget: string | null;
}

/**
 * Dispatches to the view currently directed by the Operator (big-screen
 * capability, FR-062). Every view is high-contrast/large-format and visually
 * distinct from the player app (FR-060) — none of these components are
 * shared with `LiveGameView`.
 */
export function BigScreenView({ copy, display, question, stepResults, rankings, mediaUrl, countdownTarget }: Props) {
  switch (display) {
    case "question":
      return <QuestionView copy={copy} question={question} />;
    case "collecting":
      return <CollectingView copy={copy} question={question} />;
    case "results":
      return <ResultsView copy={copy} stepResults={stepResults} rankings={rankings} />;
    case "leaderboard":
      return <LeaderboardView copy={copy} rankings={rankings} title={copy.leaderboardTitle} />;
    case "podium":
      return <LeaderboardView copy={copy} rankings={rankings} title={copy.podiumTitle} topOnly />;
    case "blank":
      return <BlankView />;
    case "waiting":
    default:
      return <WaitingView copy={copy} mediaUrl={mediaUrl} countdownTarget={countdownTarget} />;
  }
}

function useCountdown(target: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (!target) return null;
  const remainingMs = Math.max(0, Date.parse(target) - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Waiting view (FR-064's big-screen half): the event's configured media/countdown, never player content. */
function WaitingView({
  copy,
  mediaUrl,
  countdownTarget,
}: {
  copy: ScreenCopy;
  mediaUrl: string | null;
  countdownTarget: string | null;
}) {
  const countdown = useCountdown(countdownTarget);

  return (
    <div data-testid="screen-waiting-view" className="flex flex-col items-center gap-6 text-center">
      {mediaUrl && (
        <img src={mediaUrl} alt="" data-testid="screen-waiting-media" className="max-h-[60vh] rounded-lg" />
      )}
      <h1 className="text-4xl font-bold sm:text-6xl">{copy.waitingTitle}</h1>
      {countdown ? (
        <p data-testid="screen-waiting-countdown" className="font-mono text-3xl sm:text-5xl">
          {countdown}
        </p>
      ) : (
        <p className="text-xl text-neutral-300 sm:text-2xl">{copy.waitingBody}</p>
      )}
    </div>
  );
}

/** Question view: text + options only, never the correct one (FR-061/design.md D4). */
function QuestionView({ question }: { copy: ScreenCopy; question: RoomQuestion | null }) {
  if (!question) return <BlankView />;
  return (
    <div data-testid="screen-question-view" className="flex w-full max-w-4xl flex-col items-center gap-8 text-center">
      <h1 className="text-3xl font-bold sm:text-5xl">{question.text}</h1>
      <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {question.options.map((option) => (
          <li
            key={option.id}
            data-testid={`screen-question-option-${option.id}`}
            className="rounded-lg border-2 border-white/30 p-6 text-xl sm:text-2xl"
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Collecting view: same content as question, a distinct holding framing while answers come in. */
function CollectingView({ copy, question }: { copy: ScreenCopy; question: RoomQuestion | null }) {
  return (
    <div data-testid="screen-collecting-view" className="flex w-full max-w-4xl flex-col items-center gap-8 text-center">
      <p className="text-2xl font-semibold text-neutral-300 sm:text-3xl">{copy.collectingTitle}</p>
      {question && <h1 className="text-3xl font-bold sm:text-5xl">{question.text}</h1>}
    </div>
  );
}

/**
 * Results view: per-participant/team outcome, never which option was correct
 * (FR-061 carve-out — this is the one view allowed to show names).
 * `step_results` itself carries only ids, not display names — resolved here
 * from the same-reveal `rankings` broadcast, which does carry them.
 */
function ResultsView({
  copy,
  stepResults,
  rankings,
}: {
  copy: ScreenCopy;
  stepResults: RoomStepResults | null;
  rankings: RoomRankings | null;
}) {
  if (!stepResults) {
    return (
      <div data-testid="screen-results-view" className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-bold sm:text-5xl">{copy.resultsTitle}</h1>
        <p className="text-xl text-neutral-300">{copy.resultsNoData}</p>
      </div>
    );
  }

  const nameByParticipant = new Map((rankings?.individuals ?? []).map((r) => [r.participantId, r.displayName]));

  return (
    <div data-testid="screen-results-view" className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <h1 className="text-3xl font-bold sm:text-5xl">{copy.resultsTitle}</h1>
      <ul className="flex w-full flex-col gap-2 text-left">
        {stepResults.participants.map((p) => (
          <li
            key={p.participantId}
            data-testid={`screen-result-participant-${p.participantId}`}
            className="flex items-center justify-between rounded-md border border-white/20 p-3 text-lg"
          >
            <span>{nameByParticipant.get(p.participantId) ?? ""}</span>
            <span>
              {p.isCorrect ? copy.resultsCorrect : copy.resultsIncorrect} · {p.points} {copy.resultsPointsSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Leaderboard and podium share the same cumulative-rankings data (design.md D8). */
function LeaderboardView({
  copy,
  rankings,
  title,
  topOnly,
}: {
  copy: ScreenCopy;
  rankings: RoomRankings | null;
  title: string;
  topOnly?: boolean;
}) {
  const individuals = rankings?.individuals ?? [];
  const shown = topOnly ? individuals.slice(0, 3) : individuals;

  return (
    <div
      data-testid={topOnly ? "screen-podium-view" : "screen-leaderboard-view"}
      className="flex w-full max-w-2xl flex-col items-center gap-6 text-center"
    >
      <h1 className="text-3xl font-bold sm:text-5xl">{title}</h1>
      {shown.length === 0 ? (
        <p className="text-xl text-neutral-300">{copy.noRankingsYet}</p>
      ) : (
        <ol className="flex w-full flex-col gap-2 text-left">
          {shown.map((entry) => (
            <li
              key={entry.participantId}
              data-testid={`screen-ranking-${entry.participantId}`}
              className="flex items-center justify-between rounded-md border border-white/20 p-3 text-lg"
            >
              <span>
                #{entry.rank} {entry.displayName}
              </span>
              <span>{entry.total}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BlankView() {
  return <div data-testid="screen-blank-view" className="h-full w-full" />;
}
