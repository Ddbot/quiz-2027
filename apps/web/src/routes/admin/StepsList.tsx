import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import type { AdminEvent, AdminStep } from "@/routes/admin/types";

// A sentinel outside the valid `position` range (which starts at 1), used as
// a transient value while swapping two steps' positions — the unique index
// on (event_id, position) would otherwise collide mid-swap.
const SWAP_SENTINEL_POSITION = 0;

interface Props {
  event: AdminEvent;
  steps: AdminStep[];
  readOnly: boolean;
  onChange: () => void;
}

/**
 * Ordered MCQ step list (event-authoring: "An admin authors an ordered
 * sequence of MCQ steps").
 */
export function StepsList({ event, steps, readOnly, onChange }: Props) {
  async function addStep() {
    const position = steps.length + 1;
    const { error } = await supabase.from("step").insert({ event_id: event.id, position });
    if (!error) onChange();
  }

  async function removeStep(stepId: string) {
    const { error } = await supabase.from("step").delete().eq("id", stepId);
    if (!error) onChange();
  }

  async function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;

    const a = steps[index];
    const b = steps[target];
    if (!a || !b) return;

    await supabase.from("step").update({ position: SWAP_SENTINEL_POSITION }).eq("id", a.id);
    await supabase.from("step").update({ position: a.position }).eq("id", b.id);
    await supabase.from("step").update({ position: b.position }).eq("id", a.id);
    onChange();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{adminCopy.stepsTitle}</h2>
        {!readOnly && (
          <Button type="button" size="sm" onClick={() => void addStep()}>
            {adminCopy.addStepButton}
          </Button>
        )}
      </div>
      {steps.length === 0 && <p>{adminCopy.noSteps}</p>}
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
            <span>
              {index + 1}. {step.game_mcq?.question_text ?? adminCopy.stepEditorTitle}
            </span>
            <div className="flex items-center gap-1"> 
              {!readOnly && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => void moveStep(index, -1)}
                    aria-label={`${adminCopy.moveStepUp} ${index + 1}`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === steps.length - 1}
                    onClick={() => void moveStep(index, 1)}
                    aria-label={`${adminCopy.moveStepDown} ${index + 1}`}
                  >
                    ↓
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to={`steps/${step.id}`}>{adminCopy.editStepButton}</Link>
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void removeStep(step.id)}
                >
                  {adminCopy.removeStepButton}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
