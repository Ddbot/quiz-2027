import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { adminCopy } from "@/routes/admin/copy";
import { NotAnImageError, uploadWaitingImage } from "@/routes/admin/imageUpload";
import type { AdminEvent } from "@/routes/admin/types";

interface Props {
  event: AdminEvent;
  readOnly: boolean;
  onUpdated: (event: AdminEvent) => void;
}

/**
 * Waiting-screen configuration (event-authoring: "An admin configures the
 * waiting screen") — optional image upload (design.md D3/D4: image only,
 * EXIF-stripped via canvas re-encode) and optional countdown target.
 */
export function WaitingScreenForm({ event, readOnly, onUpdated }: Props) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState(event.waiting_countdown_target ?? "");
  const [countdownError, setCountdownError] = useState<string | null>(null);
  const [savingCountdown, setSavingCountdown] = useState(false);

  async function handleFileChange(changeEvent: ChangeEvent<HTMLInputElement>) {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = "";
    if (!file) return;

    setImageError(null);
    setUploading(true);
    try {
      const publicUrl = await uploadWaitingImage(supabase, event.id, file);
      const { data, error } = await supabase
        .from("event")
        .update({ waiting_media_path: publicUrl })
        .eq("id", event.id)
        .select()
        .single();
      if (error || !data) {
        setImageError(adminCopy.waitingImageUploadError);
        return;
      }
      onUpdated(data as AdminEvent);
    } catch (err) {
      setImageError(err instanceof NotAnImageError ? adminCopy.waitingImageError : adminCopy.waitingImageUploadError);
    } finally {
      setUploading(false);
    }
  }

  async function handleCountdownSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setCountdownError(null);
    setSavingCountdown(true);
    try {
      const { data, error } = await supabase
        .from("event")
        .update({ waiting_countdown_target: countdownTarget || null })
        .eq("id", event.id)
        .select()
        .single();
      if (error || !data) {
        setCountdownError(adminCopy.saveError);
        return;
      }
      onUpdated(data as AdminEvent);
    } finally {
      setSavingCountdown(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <h2 className="text-sm font-medium">{adminCopy.waitingScreenTitle}</h2>

      {readOnly ? (
        <p role="note">{adminCopy.readOnlyNotice}</p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {adminCopy.waitingImageLabel}
            {/* No `accept` filter here — it only hints the OS picker and would
                make an invalid-file selection unreproducible in tests; the
                MIME check (and the message below) is enforced in handleFileChange. */}
            <input type="file" onChange={(e) => void handleFileChange(e)} disabled={uploading} />
          </label>
          {imageError && (
            <p role="alert" className="text-sm text-destructive">
              {imageError}
            </p>
          )}

          <form onSubmit={handleCountdownSubmit} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {adminCopy.countdownTargetLabel}
              <input
                type="datetime-local"
                className="rounded-md border px-3 py-2"
                value={countdownTarget}
                onChange={(e) => setCountdownTarget(e.target.value)}
              />
            </label>
            {countdownError && (
              <p role="alert" className="text-sm text-destructive">
                {countdownError}
              </p>
            )}
            <Button type="submit" size="sm" disabled={savingCountdown}>
              {adminCopy.saveButton}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
