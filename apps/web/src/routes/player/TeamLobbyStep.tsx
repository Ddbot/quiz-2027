import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import type { PlayerCopy } from "@/routes/player/copy";
import type { TeamLobbyErrorKind } from "@/routes/player/teamLobbyErrors";
import type { Team } from "@/routes/player/types";
import { useTeamLobby } from "@/routes/player/useTeamLobby";

interface Props {
  copy: PlayerCopy;
  eventId: string;
  participantId: string;
}

function errorMessageFor(kind: TeamLobbyErrorKind | null, copy: PlayerCopy): string | null {
  switch (kind) {
    case null:
      return null;
    case "name_taken":
      return copy.teamErrorNameTaken;
    case "profanity":
      return copy.errorProfanity;
    case "not_captain":
      return copy.teamErrorNotCaptain;
    case "event_not_joinable":
      return copy.errorEventNotJoinable;
    default:
      return copy.errorGeneric;
  }
}

/**
 * Team formation, shown after a successful join while the event is still a
 * draft (event-authoring... team-lobby: "A player is offered team formation
 * while the event is a draft"). The caller is responsible for that gating —
 * see OnboardingFlow.
 */
export function TeamLobbyStep({ copy, eventId, participantId }: Props) {
  const teamLobby = useTeamLobby(eventId, participantId);
  if (teamLobby.status !== "loaded") return null;
  const { teams, myTeamId, actionError, createTeam, joinTeam, leaveTeam, renameTeam } = teamLobby;

  const myTeam = teams.find((t) => t.id === myTeamId) ?? null;
  const isCaptain = myTeam !== null && myTeam.captain_participant_id === participantId;
  const otherTeams = teams.filter((t) => t.id !== myTeamId);
  const errorMessage = errorMessageFor(actionError, copy);

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <h2 className="text-center text-lg font-semibold">{copy.teamLobbyTitle}</h2>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {myTeam ? (
        <CurrentTeamCard
          copy={copy}
          team={myTeam}
          isCaptain={isCaptain}
          onLeave={() => void leaveTeam()}
          onRename={(name) => void renameTeam(myTeam.id, name)}
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{copy.teamLobbySoloIntro}</p>
          <CreateTeamForm copy={copy} onCreate={(name) => void createTeam(name)} />
        </>
      )}

      <TeamList copy={copy} teams={otherTeams} onJoin={(teamId) => void joinTeam(teamId)} />
    </div>
  );
}

function CurrentTeamCard({
  copy,
  team,
  isCaptain,
  onLeave,
  onRename,
}: {
  copy: PlayerCopy;
  team: Team;
  isCaptain: boolean;
  onLeave: () => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(team.name);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onRename(name);
    setRenaming(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <span className="text-muted-foreground text-xs">{copy.currentTeamLabel}</span>
      {renaming ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" size="sm">
            {copy.renameTeamButton}
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium" data-testid="current-team-name">
            {team.name}
          </span>
          {isCaptain && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(true)}>
              {copy.renameTeamButton}
            </Button>
          )}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onLeave}>
        {copy.leaveTeamButton}
      </Button>
    </div>
  );
}

function CreateTeamForm({ copy, onCreate }: { copy: PlayerCopy; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onCreate(name);
    setName("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label className="sr-only" htmlFor="team-name">
        {copy.teamNameLabel}
      </label>
      <input
        id="team-name"
        className="flex-1 rounded-md border px-3 py-2"
        placeholder={copy.teamNameLabel}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={40}
      />
      <Button type="submit">{copy.createTeamButton}</Button>
    </form>
  );
}

function TeamList({
  copy,
  teams,
  onJoin,
}: {
  copy: PlayerCopy;
  teams: Team[];
  onJoin: (teamId: string) => void;
}) {
  if (teams.length === 0) {
    return <p className="text-muted-foreground text-sm">{copy.noTeamsAvailable}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {teams.map((team) => (
        <li key={team.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
          <span>{team.name}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onJoin(team.id)}>
            {copy.joinTeamButton}
          </Button>
        </li>
      ))}
    </ul>
  );
}
