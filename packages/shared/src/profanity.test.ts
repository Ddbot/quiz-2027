import { describe, expect, it } from "vitest";

import { isProfane } from "./profanity.js";

describe("isProfane", () => {
  it("flags an English match", () => {
    expect(isProfane("shit head")).toBe(true);
  });

  it("flags a French match", () => {
    expect(isProfane("gros connard")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isProfane("BaStArD")).toBe(true);
  });

  it("lets a clean name through", () => {
    expect(isProfane("Alex Dupont")).toBe(false);
  });
});
