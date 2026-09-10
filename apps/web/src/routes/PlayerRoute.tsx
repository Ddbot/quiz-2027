import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

/** Player entry surface. Placeholder shell — reads and shows the join code. */
export function PlayerRoute() {
  const { joinCode } = useParams<{ joinCode: string }>();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Quiz 2027</h1>
      <p className="text-muted-foreground">
        Code de session : <span data-testid="join-code">{joinCode}</span>
      </p>
      <Button disabled>Rejoindre (bientôt)</Button>
    </main>
  );
}
