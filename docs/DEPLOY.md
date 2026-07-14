# Deploy your own FreeRemoteDesk

FreeRemoteDesk is BYO-infrastructure: you deploy the signaling Worker and the PWA to your own free-tier Cloudflare + Vercel accounts. Nobody else (including the project maintainers) has access to your instance.

Total cost: **$0/month.** Total setup time: **~10 minutes** first time, none after that.

## What you need

- A **GitHub account** (to fork this repo — Cloudflare and Vercel both pull from it)
- A **Cloudflare account** — free tier, no credit card required
- A **Vercel account** — free tier, no credit card required
- A machine you want to remotely reach — Windows / macOS / Linux

Optional but nice:
- Your own domain (Vercel and Cloudflare both do free HTTPS for their subdomains, so a custom domain is not needed)

## Step 1 — Deploy the signaling Worker

Signaling is what lets your two devices find each other on the internet. It relays a handful of small messages per session. Cloudflare Workers free tier includes 100,000 requests/day — more than enough for personal use.

1. Click: **[Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/?url=https://github.com/Teylersf/freeremotedesk)**
2. Sign in to your Cloudflare account (or create one).
3. Authorize the Cloudflare Deploy Button to fork this repo to your GitHub account.
4. Cloudflare will build and deploy the Worker in about 60 seconds.
5. **Copy the URL** it shows you — will look like `https://freeremotedesk-signaling.<yourname>.workers.dev`.

You can verify the deploy by opening `<your-url>/health` in a browser — should return `{"ok":true,"service":"freeremotedesk-signaling"}`.

### Or deploy manually with the wrangler CLI

If you'd rather not use the Deploy Button:

```bash
git clone https://github.com/Teylersf/freeremotedesk
cd freeremotedesk/signaling
pnpm install
npx wrangler login
npx wrangler deploy
```

## Step 2 — Deploy the PWA to Vercel

The PWA is what you'll open in your browser to view/control your remote machine. Vercel free tier gives you 100 GB/month of bandwidth — plenty.

1. Click: **[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/Teylersf/freeremotedesk&root-directory=pwa&env=VITE_SIGNALING_URL&envDescription=Signaling%20Worker%20URL%20from%20step%201&project-name=freeremotedesk&repository-name=freeremotedesk-pwa)**
2. Sign in to Vercel (or create an account).
3. When prompted, paste your signaling URL from step 1 as `VITE_SIGNALING_URL`.
4. Vercel will build and deploy the PWA. Takes about 90 seconds.
5. **Copy the URL** — will look like `https://freeremotedesk-<random>.vercel.app`.

You can open the URL right away — the PWA loads and shows the pairing-code entry screen.

### Or deploy manually with the Vercel CLI

```bash
cd freeremotedesk/pwa
pnpm install
pnpm build
npx vercel deploy --prod
```

Set the env var afterward:

```bash
npx vercel env add VITE_SIGNALING_URL production
# paste the signaling URL when prompted
npx vercel deploy --prod  # redeploy so the env var takes effect
```

### Custom domain (optional)

In Vercel's project dashboard → Settings → Domains → add your domain. Vercel handles DNS + free HTTPS cert automatically.

## Step 3 — Install the agent on your host machine

The agent runs on the machine you want to remotely reach.

1. Go to the [latest release](https://github.com/Teylersf/freeremotedesk/releases/latest).
2. Download the installer for your OS:
   - **Windows**: `FreeRemoteDesk-<version>-x64.msi`
   - **macOS (Intel)**: `FreeRemoteDesk-<version>-x64.dmg`
   - **macOS (Apple Silicon)**: `FreeRemoteDesk-<version>-aarch64.dmg`
   - **Linux (Debian/Ubuntu)**: `freeremotedesk_<version>_amd64.deb`
3. Run the installer.
4. Launch FreeRemoteDesk from your Start menu / Applications.
5. First-run wizard asks for:
   - **Signaling URL** — paste the URL from step 1
   - **PWA URL** — paste the URL from step 2 (optional; shown as a hint on the pairing screen)
6. Click **Save and continue**.

The agent is now ready. Click **Start session** whenever you want to expose your screen. It pops the OS screen-picker; choose which screen or window to share. You get a 6-character pairing code.

## Step 4 — Connect

On your other device (phone, tablet, laptop):

1. Open your PWA URL in a browser (Chrome, Edge, Safari, Firefox).
2. On mobile: tap "Add to Home Screen" from the browser menu to install as a PWA.
3. Enter the 6-character code from your host agent.
4. Tap **Connect**.
5. You should see your host screen. Move the mouse, type — it all works.

## Troubleshooting

**PWA says "not a FreeRemoteDesk signaling server" during setup**
Your signaling URL is wrong or your Worker didn't deploy. Check `<your-url>/health` returns `{"ok":true,...}`.

**Agent connects but PWA never shows the screen**
Probably a WebRTC ICE failure. Symmetric-NAT-to-symmetric-NAT connections fail without TURN. See [`ARCHITECTURE.md`](../ARCHITECTURE.md#turn) for how to add a TURN server (Cloudflare Calls at $0.05/GB).

**Input events don't reach the host**
Check the agent window's log panel (dev builds only for now). If you see `inject_input failed` messages, the enigo crate isn't happy — file an issue with your OS/version.

**I want to change my signaling URL**
Agent: click "Settings" in the agent window → wizard shows again.
PWA: click "Change signaling server" on the pairing screen.

## Cost notes (for the curious)

Cloudflare Workers free tier: 100k requests/day, 10ms CPU/request. Signaling is ~10 requests per pairing session. Even at heavy personal use (100 sessions/day), you'd use ~1% of the daily limit.

Vercel free tier: 100 GB/month bandwidth. The PWA is ~150 KB gzipped. Serving it a million times fits comfortably.

The only path to a bill is TURN traffic if you enable it — Cloudflare Calls charges $0.05/GB, and TURN only kicks in for symmetric-NAT ↔ symmetric-NAT pairings (~15–25% of connections). For personal use that's still typically pennies/month.
