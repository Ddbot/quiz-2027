import { Link, useParams } from "react-router-dom";

import { adminCopy } from "@/routes/admin/copy";
import { McqForm } from "@/routes/admin/McqForm";
import { useStepEditor } from "@/routes/admin/useStepEditor";

/** Single-step editor: MCQ content, timer, scoring. */
export function StepEditorPage() {
  const { eventId, stepId } = useParams<{ eventId: string; stepId: string }>();
  const state = useStepEditor(eventId, stepId);

  if (state.status === "loading") return null;
  if (state.status === "not-found") {
    return <p role="alert">{adminCopy.forbiddenTitle}</p>;
  }

  const { event, step, mcq } = state;
  const readOnly = event.status !== "draft";

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/admin/events/${event.id}`} className="text-sm underline">
        {adminCopy.stepEditorBack}
      </Link>
      {readOnly && <p role="note">{adminCopy.readOnlyNotice}</p>}
      <McqForm step={step} mcq={mcq} readOnly={readOnly} onSaved={state.reload} />
    </div>
  );
}
