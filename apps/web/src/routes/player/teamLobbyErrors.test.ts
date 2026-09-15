import { describe, expect, it } from "vitest";

import { mapTeamLobbyError } from "@/routes/player/teamLobbyErrors";

describe("mapTeamLobbyError", () => {
  it.each([
    ["name_taken", "name_taken"],
    ["profanity", "profanity"],
    ["not_a_participant", "not_a_participant"],
    ["not_captain", "not_captain"],
    ["event_not_joinable", "event_not_joinable"],
  ] as const)("maps %s to itself", (message, expected) => {
    expect(mapTeamLobbyError(message)).toBe(expected);
  });

  it("falls back to generic for an unrecognized message", () => {
    expect(mapTeamLobbyError("some-unexpected-error")).toBe("generic");
  });

  it("falls back to generic for an undefined message", () => {
    expect(mapTeamLobbyError(undefined)).toBe("generic");
  });
});
