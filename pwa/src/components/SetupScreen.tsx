import { useState } from "react";
import { setSignalingUrl, toHttpUrl } from "../config";

type Props = { onSaved: (url: string) => void };

/**
 * Shown when the PWA has no signaling URL configured (no env var + no
 * localStorage). Prompts the user to paste their own Cloudflare Workers URL.
 *
 * For the "one click deploy" path this screen never shows — Vercel builds
 * the PWA with VITE_SIGNALING_URL baked in.
 */
export function SetupScreen({ onSaved }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = url.trim().length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setStatus("Testing…");
    try {
      const cleaned = url.trim().replace(/\/+$/, "");
      const r = await fetch(`${toHttpUrl(cleaned)}/health`, { method: "GET" });
      if (!r.ok) throw new Error(`server returned ${r.status}`);
      const j = (await r.json()) as { ok?: boolean; service?: string };
      if (!j.ok || j.service !== "freeremotedesk-signaling") {
        throw new Error(`not a FreeRemoteDesk signaling server`);
      }
      setSignalingUrl(cleaned);
      onSaved(cleaned);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Health check failed");
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          First-time setup. Paste your signaling Worker URL.
        </p>
      </div>

      <input
        autoFocus
        placeholder="https://freeremotedesk-signaling.you.workers.dev"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ letterSpacing: 0, textTransform: "none", fontSize: "0.85rem" }}
      />

      <button type="submit" disabled={!canSubmit}>
        {busy ? "Testing…" : "Continue"}
      </button>

      {status && <div className="muted">{status}</div>}

      <div className="muted" style={{ fontSize: "0.75rem", opacity: 0.6 }}>
        Don't have one yet? Click "Deploy to Cloudflare" on the FreeRemoteDesk
        GitHub repo to spin up your own signaling Worker in a couple of clicks.
      </div>
    </form>
  );
}
