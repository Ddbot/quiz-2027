import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, uploadWaitingImage } = vi.hoisted(() => ({
  from: vi.fn(),
  uploadWaitingImage: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from },
}));

vi.mock("@/routes/admin/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/routes/admin/imageUpload")>(
    "@/routes/admin/imageUpload",
  );
  return { ...actual, uploadWaitingImage };
});

const { WaitingScreenForm } = await import("@/routes/admin/WaitingScreenForm");
const { NotAnImageError } = await import("@/routes/admin/imageUpload");
import type { AdminEvent } from "@/routes/admin/types";

const EVENT: AdminEvent = {
  id: "evt-1",
  join_code: "AAAAAA",
  title: "Soirée",
  language: "fr",
  status: "draft",
  venue_label: null,
  waiting_media_path: null,
  waiting_countdown_target: null,
  created_at: "2026-01-01T00:00:00Z",
};

function mockUpdate(result: { data: unknown; error: unknown }) {
  const single = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  return { update };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WaitingScreenForm", () => {
  it("rejects a non-image upload with a clear message", async () => {
    uploadWaitingImage.mockRejectedValue(new NotAnImageError());
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<WaitingScreenForm event={EVENT} readOnly={false} onUpdated={onUpdated} />);

    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    const input = screen.getByLabelText(/image \(facultatif\)/i);
    await user.upload(input, file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/doit être une image/i);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("uploads an accepted image and saves its reference on the event", async () => {
    uploadWaitingImage.mockResolvedValue("https://example/event-media/evt-1/waiting.png");
    mockUpdate({
      data: { ...EVENT, waiting_media_path: "https://example/event-media/evt-1/waiting.png" },
      error: null,
    });
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<WaitingScreenForm event={EVENT} readOnly={false} onUpdated={onUpdated} />);

    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/image \(facultatif\)/i);
    await user.upload(input, file);

    await waitFor(() =>
      expect(from).toHaveBeenCalledWith("event"),
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ waiting_media_path: "https://example/event-media/evt-1/waiting.png" }),
    );
  });

  it("saves a countdown target", async () => {
    const { update } = mockUpdate({
      data: { ...EVENT, waiting_countdown_target: "2026-12-01T20:00" },
      error: null,
    });
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<WaitingScreenForm event={EVENT} readOnly={false} onUpdated={onUpdated} />);

    const input = screen.getByLabelText(/compte à rebours jusqu'à/i);
    await user.type(input, "2026-12-01T20:00");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ waiting_countdown_target: "2026-12-01T20:00" }),
      ),
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("shows the read-only notice and no controls once the event leaves draft", () => {
    render(<WaitingScreenForm event={{ ...EVENT, status: "live" }} readOnly onUpdated={vi.fn()} />);

    expect(screen.getByRole("note")).toHaveTextContent(/lecture seule/i);
    expect(screen.queryByLabelText(/image \(facultatif\)/i)).not.toBeInTheDocument();
  });
});
