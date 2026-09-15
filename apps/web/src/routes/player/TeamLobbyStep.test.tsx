import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from, rpc },
}));

const { TeamLobbyStep } = await import("@/routes/player/TeamLobbyStep");
const { getPlayerCopy } = await import("@/routes/player/copy");

const TEAMS = [
  { id: "team-1", event_id: "evt-1", name: "Alpha", captain_participant_id: "me" },
  { id: "team-2", event_id: "evt-1", name: "Beta", captain_participant_id: "other-captain" },
];

function mockFrom({ myTeamId = null as string | null, teams = TEAMS } = {}) {
  from.mockImplementation((table: string) => {
    if (table === "team") {
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: teams, error: null }) }) }) };
    }
    if (table === "participant") {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: { team_id: myTeamId }, error: null }) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function renderStep(props: Partial<{ eventId: string; participantId: string }> = {}) {
  return render(
    <TeamLobbyStep
      copy={getPlayerCopy("fr")}
      eventId={props.eventId ?? "evt-1"}
      participantId={props.participantId ?? "me"}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamLobbyStep — solo view", () => {
  it("shows the create form and the joinable teams list", async () => {
    mockFrom();
    renderStep();

    expect(await screen.findByPlaceholderText(/nom de l'équipe/i)).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByTestId("current-team-name")).not.toBeInTheDocument();
  });

  it("shows an empty-list message when there are no teams yet", async () => {
    mockFrom({ teams: [] });
    renderStep();

    expect(await screen.findByText(/aucune équipe pour le moment/i)).toBeInTheDocument();
  });
});

describe("TeamLobbyStep — on-team view", () => {
  it("shows the current team and a leave control, hides the create form", async () => {
    mockFrom({ myTeamId: "team-1" });
    renderStep();

    expect(await screen.findByTestId("current-team-name")).toHaveTextContent("Alpha");
    expect(screen.getByRole("button", { name: /quitter l'équipe/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/nom de l'équipe/i)).not.toBeInTheDocument();
    // The other team is still listed, so switching is possible.
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows a rename control for the captain", async () => {
    mockFrom({ myTeamId: "team-1" }); // team-1's captain is "me"
    renderStep();

    await screen.findByTestId("current-team-name");
    expect(screen.getByRole("button", { name: /^renommer$/i })).toBeInTheDocument();
  });

  it("hides the rename control for a non-captain member", async () => {
    mockFrom({ myTeamId: "team-2" }); // team-2's captain is "other-captain", not "me"
    renderStep();

    await screen.findByTestId("current-team-name");
    expect(screen.queryByRole("button", { name: /^renommer$/i })).not.toBeInTheDocument();
  });
});

describe("TeamLobbyStep — create a team", () => {
  it("creates a team with the entered name", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderStep();

    const input = await screen.findByPlaceholderText(/nom de l'équipe/i);
    await user.type(input, "New Team");
    await user.click(screen.getByRole("button", { name: /créer une équipe/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("create_team", { p_event_id: "evt-1", p_name: "New Team" }),
    );
  });

  it("shows the name-taken message on rejection", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: { message: "name_taken" } });
    const user = userEvent.setup();
    renderStep();

    const input = await screen.findByPlaceholderText(/nom de l'équipe/i);
    await user.type(input, "Alpha");
    await user.click(screen.getByRole("button", { name: /créer une équipe/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/déjà pris/i);
  });

  it("shows the profanity message on rejection", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: { message: "profanity" } });
    const user = userEvent.setup();
    renderStep();

    const input = await screen.findByPlaceholderText(/nom de l'équipe/i);
    await user.type(input, "bad word");
    await user.click(screen.getByRole("button", { name: /créer une équipe/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'est pas autorisé/i);
  });
});

describe("TeamLobbyStep — join and switch", () => {
  it("joins a listed team", async () => {
    mockFrom();
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderStep();

    await screen.findByText("Alpha");
    const joinButtons = screen.getAllByRole("button", { name: /^rejoindre$/i });
    await user.click(joinButtons[0]!);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("join_team", { p_team_id: "team-1" }));
  });

  it("switches directly from the current team to a different one", async () => {
    mockFrom({ myTeamId: "team-1" });
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderStep();

    await screen.findByTestId("current-team-name");
    await user.click(screen.getByRole("button", { name: /^rejoindre$/i })); // only "Beta" is listed (not current team)

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("join_team", { p_team_id: "team-2" }));
  });
});

describe("TeamLobbyStep — leave", () => {
  it("leaves the current team", async () => {
    mockFrom({ myTeamId: "team-1" });
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderStep();

    await screen.findByTestId("current-team-name");
    await user.click(screen.getByRole("button", { name: /quitter l'équipe/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("leave_team", { p_event_id: "evt-1" }));
  });
});

describe("TeamLobbyStep — rename", () => {
  it("renames the team as captain", async () => {
    mockFrom({ myTeamId: "team-1" });
    rpc.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderStep();

    await screen.findByTestId("current-team-name");
    await user.click(screen.getByRole("button", { name: /^renommer$/i }));
    const input = screen.getByDisplayValue("Alpha");
    await user.clear(input);
    await user.type(input, "Renamed Alpha");
    await user.click(screen.getByRole("button", { name: /^renommer$/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rename_team", { p_team_id: "team-1", p_name: "Renamed Alpha" }),
    );
  });

  it("shows the not-captain message if rejected", async () => {
    mockFrom({ myTeamId: "team-1" });
    rpc.mockResolvedValue({ error: { message: "not_captain" } });
    const user = userEvent.setup();
    renderStep();

    await screen.findByTestId("current-team-name");
    await user.click(screen.getByRole("button", { name: /^renommer$/i }));
    await user.click(screen.getByRole("button", { name: /^renommer$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/seul le ou la capitaine/i);
  });
});
