import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@quiz/shared", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@quiz/shared");
  });
});
