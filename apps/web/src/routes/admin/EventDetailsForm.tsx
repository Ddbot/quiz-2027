import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import type { AdminEvent } from "@/routes/admin/types";

// PostgREST's code for "the UPDATE matched no row" — the shape an RLS denial
// takes here, since the USING clause simply excludes the row rather than
// raising an explicit permission error (design.md D7).
const NO_ROW_MATCHED = "PGRST116";

interface Props {
  event: AdminEvent;
  readOnly: boolean;
  onSaved: (event: AdminEvent) => void;
}

/** Edit a draft event's details (event-authoring: "An admin can author a draft event"). */
export function EventDetailsForm({ event, readOnly, onSaved }: Props) {
  const [title, setTitle] = useState(event.title);
  const [language, setLanguage] = useState<"fr" | "en">(event.language);
  const [venueLabel, setVenueLabel] = useState(event.venue_label ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: updateError } = await supabase
        .from("event")
        .update({ title, language, venue_label: venueLabel.trim() || null })
        .eq("id", event.id)
        .select()
        .single();

      if (updateError || !data) {
        setError(updateError?.code === NO_ROW_MATCHED ? adminCopy.editRejected : adminCopy.saveError);
        return;
      }
      onSaved(data as AdminEvent);
    } finally {
      setSubmitting(false);
    }
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-4">
        <p role="note">{adminCopy.readOnlyNotice}</p>
        <dl className="text-sm">
          <dt className="font-medium">{adminCopy.titleLabel}</dt>
          <dd>{event.title}</dd>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-4">
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.titleLabel}
        <input
          className="rounded-md border px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.languageLabel}
        <select
          className="rounded-md border px-3 py-2"
          value={language}
          onChange={(e) => setLanguage(e.target.value as "fr" | "en")}
        >
          <option value="fr">{adminCopy.languageFr}</option>
          <option value="en">{adminCopy.languageEn}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {adminCopy.venueLabel}
        <input
          className="rounded-md border px-3 py-2"
          value={venueLabel}
          onChange={(e) => setVenueLabel(e.target.value)}
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
