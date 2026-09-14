import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import type { AdminMcq, AdminStep, McqOption } from "@/routes/admin/types";

const MIN_OPTIONS = 2;

function newOption(): McqOption {
  return { id: crypto.randomUUID(), label: "" };
}

interface Props {
  step: AdminStep;
  mcq: AdminMcq | null;
  readOnly: boolean;
  onSaved: () => void;
}

/**
 * MCQ content, timer, and scoring for one step (event-authoring: "An admin
 * configures each MCQ step's content and scoring").
 */
export function McqForm({ step, mcq, readOnly, onSaved }: Props) {
  const [questionText, setQuestionText] = useState(mcq?.question_text ?? "");
  const [options, setOptions] = useState<McqOption[]>(
    mcq?.options && mcq.options.length >= MIN_OPTIONS ? mcq.options : [newOption(), newOption()],
  );
  const [correctOptionId, setCorrectOptionId] = useState(mcq?.correct_option_id ?? "");
  const [timed, setTimed] = useState(step.timed);
  const [countdownSeconds, setCountdownSeconds] = useState(step.countdown_seconds);
  const [pointsCorrect, setPointsCorrect] = useState(step.points_correct);
  const [teamAwardPoints, setTeamAwardPoints] = useState(step.team_award_points);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateOptionLabel(id: string, label: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, newOption()]);
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
    if (correctOptionId === id) setCorrectOptionId("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (options.length < MIN_OPTIONS) {
      setError(adminCopy.optionsMinError);
      return;
    }
    if (!correctOptionId || !options.some((o) => o.id === correctOptionId)) {
      setError(adminCopy.correctOptionRequiredError);
      return;
    }

    setSubmitting(true);
    try {
      const { error: mcqError } = await supabase
        .from("game_mcq")
        .upsert({ step_id: step.id, question_text: questionText, options, correct_option_id: correctOptionId });
      const { error: stepError } = await supabase
        .from("step")
        .update({
          timed,
          countdown_seconds: countdownSeconds,
          points_correct: pointsCorrect,
          team_award_points: teamAwardPoints,
        })
        .eq("id", step.id);

      if (mcqError || stepError) {
        setError(adminCopy.saveError);
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-4">
        <p role="note">{adminCopy.readOnlyNotice}</p>
        <p>{questionText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border p-4">
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.questionLabel}
        <textarea
          className="rounded-md border px-3 py-2"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          required
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{adminCopy.optionsTitle}</legend>
        {options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="radio"
                name="correct-option"
                checked={correctOptionId === option.id}
                onChange={() => setCorrectOptionId(option.id)}
                aria-label={`${adminCopy.correctOptionLabel} ${index + 1}`}
              />
              {adminCopy.correctOptionLabel}
            </label>
            <input
              className="flex-1 rounded-md border px-3 py-2"
              value={option.label}
              onChange={(e) => updateOptionLabel(option.id, e.target.value)}
              aria-label={`${adminCopy.optionLabel} ${index + 1}`}
              required
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeOption(option.id)}
              disabled={options.length <= MIN_OPTIONS}
            >
              {adminCopy.removeOptionButton}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addOption}>
          {adminCopy.addOptionButton}
        </Button>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
        {adminCopy.timedLabel}
      </label>

      {timed && (
        <label className="flex flex-col gap-1 text-sm">
          {adminCopy.countdownSecondsLabel}
          <input
            type="number"
            min={1}
            className="rounded-md border px-3 py-2"
            value={countdownSeconds}
            onChange={(e) => setCountdownSeconds(Number(e.target.value))}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.pointsCorrectLabel}
        <input
          type="number"
          min={0}
          className="rounded-md border px-3 py-2"
          value={pointsCorrect}
          onChange={(e) => setPointsCorrect(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.teamAwardPointsLabel}
        <input
          type="number"
          min={0}
          className="rounded-md border px-3 py-2"
          value={teamAwardPoints}
          onChange={(e) => setTeamAwardPoints(Number(e.target.value))}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {adminCopy.saveButton}
      </Button>
    </form>
  );
}
