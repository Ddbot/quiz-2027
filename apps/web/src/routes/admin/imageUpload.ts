import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "event-media";

export class NotAnImageError extends Error {
  constructor() {
    super("Selected file is not an image");
  }
}

/**
 * Re-encodes an image file via an off-screen canvas (design.md D3). Canvas
 * export never carries the source file's embedded metadata (EXIF, XMP, GPS)
 * — the canvas pixel buffer holds no such data to begin with — so this is
 * the EXIF/metadata strip, not a separate step.
 */
export async function reencodeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new NotAnImageError();

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Canvas re-encode produced no output");
  return blob;
}

/**
 * Strips metadata (via `reencodeImage`) and uploads the waiting-screen image
 * for an event, overwriting any previous upload for that event (design.md
 * D2: one object per event). Returns the public URL to store on
 * `event.waiting_media_path`.
 */
export async function uploadWaitingImage(
  supabase: SupabaseClient,
  eventId: string,
  file: File,
): Promise<string> {
  const reencoded = await reencodeImage(file);
  const path = `${eventId}/waiting.png`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, reencoded, { contentType: "image/png", upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
