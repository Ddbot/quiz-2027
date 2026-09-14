import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrivacyRoute } from "@/routes/legal/PrivacyRoute";
import { TermsRoute } from "@/routes/legal/TermsRoute";

describe("placeholder legal pages", () => {
  it("renders the Terms of Service page", () => {
    render(<TermsRoute />);
    expect(screen.getByRole("heading", { name: /terms of service/i })).toBeInTheDocument();
  });

  it("renders the Privacy Policy page", () => {
    render(<PrivacyRoute />);
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument();
  });
});
