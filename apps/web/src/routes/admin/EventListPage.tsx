import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import { NewEventForm } from "@/routes/admin/NewEventForm";
import { useAdminEvents } from "@/routes/admin/useAdminEvents";
import type { AdminEvent } from "@/routes/admin/types";

const STATUS_LABEL: Record<AdminEvent["status"], string> = {
  draft: adminCopy.statusDraft,
  live: adminCopy.statusLive,
  ended: adminCopy.statusEnded,
};

/** Admin's event list (event-authoring: "An admin can author a draft event"). */
export function EventListPage() {
  const state = useAdminEvents();

  async function handleDelete(eventId: string) {
    if (!window.confirm(adminCopy.deleteConfirm)) return;
    const { error } = await supabase.from("event").delete().eq("id", eventId);
    if (error) {
      window.alert(adminCopy.deleteError);
      return;
    }
    if (state.status === "loaded") state.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <NewEventForm
        onCreated={() => {
          if (state.status === "loaded") state.reload();
        }}
      />

      <div>
        <h2 className="mb-2 text-sm font-medium">{adminCopy.eventListTitle}</h2>
        {state.status === "loaded" && state.events.length === 0 && <p>{adminCopy.noEvents}</p>}
        {state.status === "loaded" && (
          <ul className="flex flex-col gap-2">
            {state.events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <Link to={`events/${event.id}`} className="flex flex-1 flex-col">
                  <span className="font-medium">{event.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {STATUS_LABEL[event.status]} · {event.join_code}
                  </span>
                </Link>
                {event.status === "draft" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(event.id)}
                  >
                    {adminCopy.deleteButton}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
