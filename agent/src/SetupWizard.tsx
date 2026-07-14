import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable as autostartDisable, enable as autostartEnable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import type { AgentConfig } from "./types";

type Props = { current: AgentConfig; onSaved: (cfg: AgentConfig) => void };

/**
 * First-run setup wizard.
 *
 * FreeRemoteDesk is BYO-infrastructure: the user runs their own signaling
 * Worker (Cloudflare, free tier) and their own PWA (Vercel, free tier).
 * This screen asks for both URLs and saves them to the agent's config.
 */
export function SetupWizard({ current, onSaved }: Props) {
  const [signalingUrl, setSignalingUrl] = useState(current.signaling_url ?? "");
  const [pwaUrl, setPwaUrl] = useState(current.pwa_url ?? "");
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void autostartIsEnabled().then(setStartOnBoot).catch(() => setStartOnBoot(false));
  }, []);

  const canSave = signalingUrl.trim().length > 0 && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setStatus("Testing signaling URL…");

    const cleaned = normalizeUrl(signalingUrl);
    try {
      const httpUrl = cleaned.replace(/^ws(s?):/, "http$1:");
      const r = await fetch(`${httpUrl}/health`, { method: "GET" });
      if (!r.ok) throw new Error(`server returned ${r.status}`);
      const j = (await r.json()) as { ok?: boolean; service?: string };
      if (!j.ok || j.service !== "freeremotedesk-signaling") {
        throw new Error(`not a FreeRemoteDesk signaling server (got: ${JSON.stringify(j)})`);
      }
    } catch (err) {
      setStatus(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
      return;
    }

    try {
      const next = await invoke<AgentConfig>("set_config", {
        config: {
          ...current,
          signaling_url: cleaned,
          pwa_url: pwaUrl.trim() ? pwaUrl.trim() : null,
        },
      });

      // Best-effort — don't fail setup if autostart toggling misbehaves.
      try {
        const currentlyEnabled = await autostartIsEnabled();
        if (startOnBoot && !currentlyEnabled) await autostartEnable();
        if (!startOnBoot && currentlyEnabled) await autostartDisable();
      } catch (e) {
        console.warn("autostart toggle failed", e);
      }

      onSaved(next);
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} style={styles.form}>
      <h1 style={{ margin: 0 }}>Setup</h1>
      <div style={styles.help}>
        FreeRemoteDesk runs on YOUR own free-tier Cloudflare and Vercel
        accounts. Deploy your instance from the GitHub repo, then paste the
        two URLs here.
      </div>

      <label style={styles.label}>
        <span>Signaling URL <span style={styles.req}>*</span></span>
        <input
          value={signalingUrl}
          onChange={(e) => setSignalingUrl(e.target.value)}
          placeholder="https://freeremotedesk-signaling.your-name.workers.dev"
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={styles.input}
        />
        <span style={styles.hint}>
          Your Cloudflare Workers URL. Get it from the Workers dashboard after
          deploying the signaling package.
        </span>
      </label>

      <label style={styles.label}>
        <span>PWA URL <span style={styles.opt}>(optional)</span></span>
        <input
          value={pwaUrl}
          onChange={(e) => setPwaUrl(e.target.value)}
          placeholder="https://myremotedesk.vercel.app"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={styles.input}
        />
        <span style={styles.hint}>
          Your Vercel deployment. Shown as a hint on the pairing screen.
        </span>
      </label>

      <label style={styles.check}>
        <input
          type="checkbox"
          checked={startOnBoot}
          onChange={(e) => setStartOnBoot(e.target.checked)}
        />
        <span>Start FreeRemoteDesk when I sign in</span>
      </label>

      <button type="submit" disabled={!canSave} style={styles.primary}>
        {busy ? "Saving…" : "Save and continue"}
      </button>

      {status && <div style={styles.error}>{status}</div>}

      <div style={styles.footer}>
        Config is stored locally in your OS app-data directory. You can change
        these anytime from the agent's Settings menu.
      </div>
    </form>
  );
}

function normalizeUrl(u: string): string {
  const t = u.trim().replace(/\/+$/, "");
  if (/^(https?|wss?):\/\//.test(t)) return t;
  return `https://${t}`;
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    maxWidth: 440,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    padding: "2rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
  },
  help: { opacity: 0.7, fontSize: "0.9rem", lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.9rem" },
  check: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  input: {
    background: "#0a0a0a",
    color: "#f5f5f5",
    border: "1px solid #2a2a2a",
    padding: "0.6rem 0.8rem",
    borderRadius: 6,
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.9rem",
    outline: "none",
  },
  hint: { opacity: 0.5, fontSize: "0.8rem" },
  req: { color: "#ef4444" },
  opt: { opacity: 0.5, fontSize: "0.8rem" },
  primary: {
    background: "#4ade80",
    color: "#000",
    border: 0,
    padding: "0.8rem 1.4rem",
    borderRadius: 6,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#ef4444", fontSize: "0.85rem" },
  footer: { opacity: 0.4, fontSize: "0.75rem", marginTop: "0.5rem" },
};
