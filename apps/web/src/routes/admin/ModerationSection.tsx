import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { adminCopy } from "@/routes/admin/copy";
import { useModeration } from "@/routes/admin/useModeration";

/**
 * Admin roster moderation (mc-console capability, moderation-kill-switch):
 * hide/show and rename any participant or team, available regardless of
 * `eventStatus` (design.md D5) — this section renders for a `draft` event
 * exactly as it does for a `live` one, since it fetches the roster directly
 * rather than through the WebSocket connection LiveControlPage's flow
 * controls depend on.
 */
export function ModerationSection({ eventId }: { eventId: string }) {
  const moderation = useModeration(eventId);
  const [actionError, setActionError] = useState(false);

  async function run(action: () => Promise<boolean>) {
    setActionError(false);
    const ok = await action();
    if (!ok) setActionError(true);
  }

  if (moderation.status !== "loaded") return null;
  const { participants, teams, setParticipantHidden, renameParticipant, setTeamHidden, renameTeam } = moderation;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{adminCopy.moderationSectionTitle}</h3>
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {adminCopy.moderationActionError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-xs font-medium">{adminCopy.moderationParticipantsTitle}</h4>
        {participants.length === 0 ? (
          <p className="text-muted-foreground text-sm">{adminCopy.moderationNoParticipants}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {participants.map((participant) => (
              <ModerationRow
                key={participant.id}
                id={participant.id}
                name={participant.display_name}
                hidden={participant.hidden}
                onToggleHidden={(hidden) => run(() => setParticipantHidden(participant.id, hidden))}
                onRename={(name) => run(() => renameParticipant(participant.id, name))}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-xs font-medium">{adminCopy.moderationTeamsTitle}</h4>
        {teams.length === 0 ? (
          <p className="text-muted-foreground text-sm">{adminCopy.moderationNoTeams}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((team) => (
              <ModerationRow
                key={team.id}
                id={team.id}
                name={team.name}
                hidden={team.hidden}
                onToggleHidden={(hidden) => run(() => setTeamHidden(team.id, hidden))}
                onRename={(name) => run(() => renameTeam(team.id, name))}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface ModerationRowProps {
  id: string;
  name: string;
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
  onRename: (name: string) => void;
}

function ModerationRow({ id, name, hidden, onToggleHidden, onRename }: ModerationRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onRename(draftName);
    setRenaming(false);
  }

  return (
    <li data-testid={`moderation-row-${id}`} className="flex items-center justify-between gap-2 rounded-md border p-2">
      {renaming ? (
        <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
          <input
            className="flex-1 rounded-md border px-2 py-1 text-sm"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={adminCopy.moderationRenamePlaceholder}
            required
          />
          <Button type="submit" size="sm">
            {adminCopy.moderationRenameButton}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(false)}>
            {adminCopy.moderationRenameCancel}
          </Button>
        </form>
      ) : (
        <>
          <span className="flex items-center gap-2 text-sm">
            {name}
            {hidden && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {adminCopy.moderationHiddenBadge}
              </span>
            )}
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onToggleHidden(!hidden)}>
              {hidden ? adminCopy.moderationShowButton : adminCopy.moderationHideButton}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(true)}>
              {adminCopy.moderationRenameButton}
            </Button>
          </span>
        </>
      )}
    </li>
  );
}
