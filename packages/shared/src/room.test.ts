import { describe, expect, it } from "vitest";

import { applyMutation, defaultRoomState, requireFlowController } from "./room.js";

describe("applyMutation", () => {
  it("reports unchanged when mutate returns the same reference", () => {
    const state = defaultRoomState();
    const result = applyMutation(state, (s) => s);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it("reports changed when mutate returns a different reference", () => {
    const state = defaultRoomState();
    const result = applyMutation(state, (s) => ({ ...s, controllerId: "admin-1" }));
    expect(result.changed).toBe(true);
    expect(result.state).toEqual({ ...state, controllerId: "admin-1" });
    expect(result.state).not.toBe(state);
  });
});

describe("requireFlowController", () => {
  it("is false when no one holds control yet", () => {
    const state = defaultRoomState();
    expect(requireFlowController(state, "admin-1")).toBe(false);
  });

  it("is true for the current controller", () => {
    const state = { ...defaultRoomState(), controllerId: "admin-1" };
    expect(requireFlowController(state, "admin-1")).toBe(true);
  });

  it("is false for a different identity", () => {
    const state = { ...defaultRoomState(), controllerId: "admin-1" };
    expect(requireFlowController(state, "admin-2")).toBe(false);
  });
});
