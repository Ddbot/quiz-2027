import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("route shells", () => {
  it("player route reads the join code from the URL", () => {
    renderAt("/e/ABCD12");
    expect(screen.getByTestId("join-code")).toHaveTextContent("ABCD12");
  });

  it("admin route renders its placeholder", () => {
    renderAt("/admin");
    expect(screen.getByRole("heading", { name: /administration/i })).toBeInTheDocument();
  });

  it("screen route reads the event id from the URL", () => {
    renderAt("/screen/evt_123");
    expect(screen.getByTestId("event-id")).toHaveTextContent("evt_123");
  });
});
