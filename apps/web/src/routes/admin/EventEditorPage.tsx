import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import { EventDetailsForm } from "@/routes/admin/EventDetailsForm";
import { JoinCodeQr } from "@/routes/admin/JoinCodeQr";
import { StepsList } from "@/routes/admin/StepsList";
import { useEventEditor } from "@/routes/admin/useEventEditor";
import { WaitingScreenForm } from "@/routes/admin/WaitingScreenForm";

/**
 * Single-event editor: details, steps, join code/QR, waiting screen. Content
 * is read-only once `event.status !== 'draft'` (event-authoring: "The
 * console prevents editing an event that is no longer a draft") — this
 * mirrors, never re-derives, the RLS rule (design.md D7).
 */
export function EventEditorPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const state = useEventEditor(eventId);

  if (state.status === "loading") return null;
  if (state.status === "not-found") {
    return <p role="alert">{adminCopy.forbiddenTitle}</p>;
  }

  const { event, steps } = state;
  const readOnly = event.status !== "draft";

  async function handleDelete() {
    if (!window.confirm(adminCopy.deleteConfirm)) return;
    const { error } = await supabase.from("event").delete().eq("id", event.id);
    if (error) {
      window.alert(adminCopy.deleteError);
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin" className="text-sm underline">
        {adminCopy.eventEditorBack}
      </Link>

      {readOnly && <p role="note">{adminCopy.readOnlyNotice}</p>}

      <Link to={`/admin/events/${event.id}/live`} className="text-sm underline">
        {adminCopy.liveControlLink}
      </Link>

      <Link to={`/admin/events/${event.id}/dashboard`} className="text-sm underline">
        {adminCopy.dashboardLink}
      </Link>

      <EventDetailsForm event={event} readOnly={readOnly} onSaved={state.reload} />

      <JoinCodeQr joinCode={event.join_code} />

      <StepsList event={event} steps={steps} readOnly={readOnly} onChange={state.reload} />

      <WaitingScreenForm event={event} readOnly={readOnly} onUpdated={state.reload} />

      {!readOnly && (
        <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
          {adminCopy.deleteButton}
        </Button>
      )}
    </div>
  );
}
