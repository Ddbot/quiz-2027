import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAnImageError, reencodeImage, uploadWaitingImage } from "@/routes/admin/imageUpload";

const FAKE_BLOB = new Blob(["fake-png-bytes"], { type: "image/png" });

beforeEach(() => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => Promise.resolve({ width: 10, height: 10, close: vi.fn() })),
  );

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);

  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(FAKE_BLOB);
  });
});

describe("reencodeImage", () => {
  it("rejects a non-image file before touching the canvas", async () => {
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    await expect(reencodeImage(file)).rejects.toBeInstanceOf(NotAnImageError);
  });

  it("re-encodes an image file via canvas and returns the exported blob", async () => {
    const file = new File(["original-bytes-with-exif"], "photo.jpg", { type: "image/jpeg" });
    const result = await reencodeImage(file);
    expect(result).toBe(FAKE_BLOB);
  });
});

describe("uploadWaitingImage", () => {
  it("uploads the re-encoded blob under the event's path and returns the public URL", async () => {
    const upload = vi.fn(() => Promise.resolve({ error: null }));
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://example/event-media/evt-1/waiting.png" } }));
    const from = vi.fn(() => ({ upload, getPublicUrl }));
    const supabase = { storage: { from } } as never;

    const file = new File(["original-bytes-with-exif"], "photo.jpg", { type: "image/jpeg" });
    const url = await uploadWaitingImage(supabase, "evt-1", file);

    expect(from).toHaveBeenCalledWith("event-media");
    expect(upload).toHaveBeenCalledWith(
      "evt-1/waiting.png",
      FAKE_BLOB,
      expect.objectContaining({ contentType: "image/png", upsert: true }),
    );
    expect(url).toBe("https://example/event-media/evt-1/waiting.png");
  });

  it("propagates a storage upload error without calling getPublicUrl", async () => {
    const upload = vi.fn(() => Promise.resolve({ error: { message: "denied" } }));
    const getPublicUrl = vi.fn();
    const from = vi.fn(() => ({ upload, getPublicUrl }));
    const supabase = { storage: { from } } as never;

    const file = new File(["x"], "photo.png", { type: "image/png" });
    await expect(uploadWaitingImage(supabase, "evt-1", file)).rejects.toEqual({ message: "denied" });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
