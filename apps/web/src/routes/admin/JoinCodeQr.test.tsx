import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JoinCodeQr } from "@/routes/admin/JoinCodeQr";
import { playerJoinUrl } from "@/routes/admin/playerJoinUrl";

describe("playerJoinUrl", () => {
  it("resolves to the player route with the join code pre-filled", () => {
    expect(playerJoinUrl("ABCDEF")).toBe(`${window.location.origin}/e/ABCDEF`);
  });
});

describe("JoinCodeQr", () => {
  it("displays the join code and a QR encoding the player route URL", async () => {
    render(<JoinCodeQr joinCode="ABCDEF" />);

    expect(screen.getByTestId("join-code-value")).toHaveTextContent("ABCDEF");

    const qr = await screen.findByTestId("join-code-qr");
    expect(qr.dataset.qrUrl).toBe(`${window.location.origin}/e/ABCDEF`);
    // The library renders a real <svg> once resolved.
    expect(qr.querySelector("svg")).not.toBeNull();
  });
});
