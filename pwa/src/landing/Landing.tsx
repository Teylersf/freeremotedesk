/**
 * Marketing landing page — the first thing visitors see at the domain root.
 *
 * SPA-simple: react conditional on pathname. Once user clicks the CTA we
 * navigate to /connect where the actual PWA client lives.
 */

export function Landing() {
  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <div style={styles.logoRow}>
          <div style={styles.logoDot} />
          <span style={styles.logoText}>FreeRemoteDesk</span>
        </div>
        <h1 style={styles.h1}>
          Your home dev machine, <br />
          from any browser. <br />
          <span style={styles.gradient}>Free forever.</span>
        </h1>
        <p style={styles.subhead}>
          A remote-desktop PWA + host agent that runs entirely on your own
          free-tier Cloudflare and Vercel accounts. No servers we control.
          No monthly bills. No accounts to create.
        </p>
        <div style={styles.ctas}>
          <a href="/connect" style={styles.primary}>
            Open the client →
          </a>
          <a
            href="https://github.com/Teylersf/freeremotedesk"
            target="_blank"
            rel="noopener"
            style={styles.secondary}
          >
            Deploy your own on GitHub
          </a>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Why it's different</h2>
        <div style={styles.grid}>
          {features.map((f) => (
            <div key={f.title} style={styles.card}>
              <div style={styles.cardIcon}>{f.icon}</div>
              <div style={styles.cardTitle}>{f.title}</div>
              <div style={styles.cardBody}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Setup in 3 clicks</h2>
        <ol style={styles.steps}>
          <li style={styles.step}>
            <b>Hand the repo to your AI</b> (Claude, Cursor, Aider, Codex — any
            AI coding tool with a terminal). Tell it: <em>"Set up
            FreeRemoteDesk. Read AGENTS.md and follow it."</em>
          </li>
          <li style={styles.step}>
            Complete <b>three CLI logins</b> when it prompts you — GitHub, Cloudflare, Vercel.
            One browser click each.
          </li>
          <li style={styles.step}>
            Run the <b>installer</b> your AI downloads for your OS. Paste the
            two URLs it gives you into the wizard.
          </li>
        </ol>
        <div style={styles.stepsFoot}>
          Prefer clicking buttons? The{" "}
          <a href="https://github.com/Teylersf/freeremotedesk" style={styles.link}>
            GitHub README
          </a>{" "}
          has "Deploy to Cloudflare" and "Deploy to Vercel" one-click buttons too.
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>How it works</h2>
        <p style={styles.paragraph}>
          The <b>host agent</b> is a small Tauri app that runs on the machine
          you want to reach. It uses your browser engine's built-in{" "}
          <code style={styles.code}>getDisplayMedia</code> to capture the screen
          and standard <b>WebRTC</b> to stream it — the same tech Zoom and
          Google Meet use — with all traffic encrypted end-to-end via DTLS-SRTP.
        </p>
        <p style={styles.paragraph}>
          The <b>PWA client</b> loads in any modern browser, installs to your
          home screen on mobile, and connects directly to the host — the
          signaling Worker only sees a handful of small handshake messages,
          never your video or input.
        </p>
        <p style={styles.paragraph}>
          The <b>signaling Worker</b> on your Cloudflare account routes the
          handshake using a single Durable Object per session. Free tier covers
          ~10,000 sessions/day; you'll never approach the limit for personal
          use.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Trusted-device reconnect</h2>
        <p style={styles.paragraph}>
          Pair your phone or laptop once with a 6-character code. From then on
          it shows up in your paired-hosts list — one tap to reconnect, no code
          needed. Credentials never leave the two devices; the signaling server
          can't impersonate you.
        </p>
      </section>

      <footer style={styles.footer}>
        <div>
          Open source (Apache-2.0 pending) —{" "}
          <a href="https://github.com/Teylersf/freeremotedesk" style={styles.link}>
            github.com/Teylersf/freeremotedesk
          </a>
        </div>
        <div style={styles.footerLinks}>
          <a href="/connect" style={styles.link}>Open client</a>
          <a href="https://github.com/Teylersf/freeremotedesk/releases/latest" style={styles.link}>
            Download agent
          </a>
          <a
            href="https://github.com/Teylersf/freeremotedesk/blob/main/AGENTS.md"
            style={styles.link}
          >
            For AI agents
          </a>
        </div>
      </footer>
    </main>
  );
}

const features = [
  {
    icon: "🔒",
    title: "Nobody in the middle",
    body: "Video + input traffic goes P2P over WebRTC. The signaling Worker on your own Cloudflare account sees only encrypted handshake bytes.",
  },
  {
    icon: "💸",
    title: "$0 forever",
    body: "Cloudflare Workers + Vercel free tiers cover personal remote-desktop use easily. No trial period, no upgrade nag, no credit card.",
  },
  {
    icon: "📱",
    title: "PWA, not an app-store install",
    body: "Open in any browser, add to home screen, launch like a native app. iOS, Android, laptops — same client everywhere.",
  },
  {
    icon: "⚡",
    title: "You own the whole stack",
    body: "Your Cloudflare account, your Vercel deploy, your installer. Fork the repo, change anything, deploy your version.",
  },
  {
    icon: "🔑",
    title: "One-tap reconnect",
    body: "Pair once with a code, then your paired devices show up in a list. Tap to reconnect — biometric-style trust, no code re-entry.",
  },
  {
    icon: "🤖",
    title: "Built for vibe coders",
    body: "The setup docs are written for AI agents. Point Claude or Cursor at the repo; it deploys the whole thing while you go get coffee.",
  },
];

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#0a0a0a",
    color: "#f5f5f5",
    minHeight: "100vh",
    padding: "0",
  },
  hero: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "5rem 1.5rem 3rem",
    textAlign: "center",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    marginBottom: "2rem",
    opacity: 0.9,
  },
  logoDot: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 12px #4ade80",
  },
  logoText: { fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.01em" },
  h1: {
    fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: "-0.03em",
    margin: "0 0 1.5rem",
  },
  gradient: {
    background: "linear-gradient(90deg, #4ade80, #22d3ee)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subhead: {
    maxWidth: 640,
    margin: "0 auto 2.5rem",
    fontSize: "clamp(1rem, 2.2vw, 1.15rem)",
    lineHeight: 1.55,
    opacity: 0.75,
  },
  ctas: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "center",
  },
  primary: {
    background: "#4ade80",
    color: "#000",
    padding: "0.85rem 1.6rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "1rem",
    textDecoration: "none",
    border: 0,
  },
  secondary: {
    background: "transparent",
    color: "#f5f5f5",
    padding: "0.85rem 1.6rem",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: "1rem",
    textDecoration: "none",
    border: "1px solid #333",
  },
  section: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "3rem 1.5rem",
  },
  h2: {
    fontSize: "clamp(1.5rem, 3vw, 2rem)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: "0 0 2rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "1.4rem",
  },
  cardIcon: { fontSize: "1.4rem", marginBottom: "0.6rem" },
  cardTitle: { fontWeight: 600, marginBottom: "0.4rem", fontSize: "1.05rem" },
  cardBody: { opacity: 0.7, fontSize: "0.92rem", lineHeight: 1.55 },
  steps: {
    listStyle: "decimal",
    paddingLeft: "1.4rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    margin: 0,
  },
  step: { fontSize: "1rem", lineHeight: 1.6, opacity: 0.85 },
  stepsFoot: { marginTop: "1.5rem", opacity: 0.55, fontSize: "0.9rem" },
  paragraph: {
    fontSize: "1rem",
    lineHeight: 1.65,
    opacity: 0.8,
    maxWidth: 780,
    margin: "0 0 1rem",
  },
  code: {
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.9em",
    background: "#171717",
    padding: "0.1rem 0.4rem",
    borderRadius: 4,
    border: "1px solid #2a2a2a",
  },
  link: { color: "#4ade80", textDecoration: "none" },
  footer: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "3rem 1.5rem 4rem",
    borderTop: "1px solid #1f1f1f",
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "1rem",
    fontSize: "0.9rem",
    opacity: 0.7,
  },
  footerLinks: { display: "flex", gap: "1.5rem", flexWrap: "wrap" },
};
