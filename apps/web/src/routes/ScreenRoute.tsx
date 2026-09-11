import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PartySocket } from "partysocket";

/**
 * Big-screen surface. Placeholder shell with a minimal high-contrast theme
 * (white-on-black, large type) so it stays legible when cast to a venue screen.
 *
 * In dev only, a "ping" widget opens a PartySocket to the EventRoom worker for
 * this event id, sends `"hello"`, and shows the echoed reply — a smoke test of
 * the real-time transport wiring (task 3.3).
 */
export function ScreenRoute() {
  const { eventId } = useParams<{ eventId: string }>();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-black p-10 text-center text-white">
      <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">Quiz 2027</h1>
      <p className="text-2xl text-neutral-300">
        Événement : <span data-testid="event-id">{eventId}</span>
      </p>
      {import.meta.env.DEV && eventId ? <PingWidget eventId={eventId} /> : null}
    </main>
  );
}

function PingWidget({ eventId }: { eventId: string }) {
  const host = import.meta.env.VITE_PARTY_HOST;

  if (!host) {
    return <PingLine reply="VITE_PARTY_HOST non défini" />;
  }
  return <PingSocket host={host} eventId={eventId} />;
}

function PingSocket({ host, eventId }: { host: string; eventId: string }) {
  const [reply, setReply] = useState<string>("(en attente)");

  useEffect(() => {
    // `party` is the kebab-case of the Durable Object class name (EventRoom).
    const socket = new PartySocket({ host, party: "event-room", room: eventId });
    socket.addEventListener("open", () => socket.send("hello"));
    socket.addEventListener("message", (event) => setReply(String(event.data)));
    socket.addEventListener("error", () => setReply("erreur de connexion"));

    return () => socket.close();
  }, [host, eventId]);

  return <PingLine reply={reply} />;
}

function PingLine({ reply }: { reply: string }) {
  return (
    <p className="rounded-md border border-neutral-700 px-4 py-2 text-lg text-neutral-200">
      ping → <span data-testid="ping-reply">{reply}</span>
    </p>
  );
}
