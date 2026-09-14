import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { adminCopy } from "@/routes/admin/copy";
import { playerJoinUrl } from "@/routes/admin/playerJoinUrl";

/** Join code + QR (event-authoring: "Each event has a generated join code and QR code"). */
export function JoinCodeQr({ joinCode }: { joinCode: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const url = playerJoinUrl(joinCode);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: "svg" }).then((markup) => {
      if (!cancelled) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium">{adminCopy.joinCodeTitle}</h3>
      <p data-testid="join-code-value" className="font-mono text-lg tracking-widest">
        {joinCode}
      </p>
      {svg && (
        // `svg` is the qrcode library's own output, not user input.
        <div data-testid="join-code-qr" data-qr-url={url} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
