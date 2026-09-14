import { Button } from "@/components/ui/button";
import type { PlayerCopy } from "@/routes/player/copy";

interface Props {
  copy: PlayerCopy;
  displayName: string;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}

/** FR-004/FR-009 — the name is permanent for this participant once confirmed. */
export function NameConfirmStep({ copy, displayName, onConfirm, onBack, submitting }: Props) {
  return (
    <div className="flex w-full flex-col gap-4 text-center">
      <h2 className="text-lg font-semibold">{copy.nameConfirmTitle}</h2>
      <p className="text-2xl font-bold" data-testid="confirm-display-name">
        {displayName}
      </p>
      <p className="text-muted-foreground text-sm">{copy.nameConfirmBody}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>
          {copy.nameConfirmBack}
        </Button>
        <Button type="button" className="flex-1" onClick={onConfirm} disabled={submitting}>
          {copy.nameConfirmButton}
        </Button>
      </div>
    </div>
  );
}
