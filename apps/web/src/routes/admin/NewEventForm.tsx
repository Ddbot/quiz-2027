import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import { createDraftEvent } from "@/routes/admin/joinCode";
import type { AdminEvent } from "@/routes/admin/types";

/** New-draft-event form (event-authoring: "An admin can author a draft event"). */
export function NewEventForm({ onCreated }: { onCreated: (event: AdminEvent) => void }) {
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [venueLabel, setVenueLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: createError } = await createDraftEvent(supabase, {
        title,
        language,
        venue_label: venueLabel.trim() || null,
      });
      if (createError || !data) {
        setError(adminCopy.createError);
        return;
      }
      setTitle("");
      setVenueLabel("");
      onCreated(data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-sm font-medium">{adminCopy.newEventTitle}</h2>
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
        {adminCopy.createButton}
      </Button>
    </form>
  );
}
