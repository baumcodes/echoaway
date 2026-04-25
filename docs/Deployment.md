# EchoAway — Production Deployment

Sibling to [`../PLAN.md`](../PLAN.md). PLAN.md ships the demo locally; this
doc deploys the same monorepo publicly so the jury and friends can try it
at `https://echoaway.com`.

It is structured the same way as PLAN.md — phased, with checklists and
agent prompts that can be handed to a coding agent for execution. Run the
phases in order; later phases assume earlier ones succeeded.

The shape of the deploy: **one EC2 instance running `docker compose` of
`web + backend + voice-agent + caddy`**, secrets fetched from SSM
Parameter Store on boot, deploys triggered via SSM SendCommand.

---

## 0. Goal

A single-instance public deployment of EchoAway Voice Concierge:

- **Web app** at `https://echoaway.com` (the polished demo surface)
- **Backend API** at `https://api.echoaway.com` (NestJS + Prisma + SQLite)
- **Voice agent** running as a long-lived worker that joins LiveKit rooms on demand
- **TLS** automatic via Let's Encrypt (Caddy), no manual cert management
- **Secrets** stored in AWS SSM Parameter Store, populated into the runtime
  via a systemd unit at boot — never on git, never on the box in plaintext
  outside `/srv/echoaway/.env` (mode `600`, owned by `ubuntu`)
- **Cost ceiling** ~$20/mo AWS + paid API usage

This is a **hackathon-grade** deploy: one box, no autoscaling, no HA, no
blue/green. Optimized for getting a working public URL quickly, with a
clean upgrade path later.

---

## 1. Architecture

```txt
                  ┌─────────────────────────────────────┐
                  │         EC2 t3.small (Ubuntu)       │
                  │  Docker + docker-compose            │
                  │                                     │
   :80/:443  ───→ │  ┌────────────────────────────┐    │
   public         │  │  caddy (TLS, reverse proxy) │    │
                  │  └─────┬──────────────┬──────┘    │
                  │        │              │             │
                  │        ▼              ▼             │
                  │   ┌─────────┐   ┌──────────┐       │
                  │   │  web    │   │ backend  │       │
                  │   │ :3000   │   │  :3001   │       │
                  │   └─────────┘   └────┬─────┘       │
                  │                      │              │
                  │   ┌──────────────┐   │              │
                  │   │ voice-agent  │   │              │
                  │   │ (no port,    │◄──┘ HTTP         │
                  │   │  outbound WS)│                  │
                  │   └──────────────┘                  │
                  │                                     │
                  │   /var/lib/echoaway/sqlite/dev.db   │
                  │   (host-mounted volume)             │
                  └─────────────────────────────────────┘
                          │
                          │ outbound WebSockets / HTTPS
                          ▼
            LiveKit Cloud · Gradium · ai-coustics · Tavily · Gemini
```

- **Caddy** terminates TLS and routes by hostname. Auto-renews Let's
  Encrypt certs; no certbot crontab to maintain.
- **web / backend / voice-agent** each run from their own image, built
  from the monorepo on the box.
- **SQLite file** lives on the host's EBS volume mounted into the backend
  container. Survives restarts; backed up by EBS snapshots.
- **No database container** — SQLite is a file, not a service.
- **Voice-agent** is intentionally portless. It opens outbound connections
  to LiveKit Cloud (audio), the backend (HTTP tools), and the partner APIs.

---

## 2. Prerequisites

- AWS account with billing alerts already configured
- AWS CLI v2 installed locally and authenticated to the target account
  (`aws sts get-caller-identity` works)
- Domain `echoaway.com` available (or a different domain — substitute
  everywhere below)
- Local Docker Desktop (or Colima) for the smoke test in Phase D2
- Repo at `/Users/.../echoaway` with `apps/{web,backend,voice-agent}`
  reasonably built per PLAN.md Phase 5+. The deploy works earlier (against
  the deterministic replay path), but the demo flow needs the agent
  pieces.

---

## 3. Cost summary

| Item                          | Monthly        |
|-------------------------------|----------------|
| EC2 `t3.small` on-demand      | ~$15.20        |
| 20 GB gp3 EBS                 | ~$1.60         |
| Elastic IP (attached)         | $0             |
| Route 53 hosted zone          | $0.50          |
| Domain registration           | ~$0.83 ($10/yr)|
| SSM Parameter Store (Standard)| $0             |
| Data transfer (low volume)    | ~$1            |
| **AWS subtotal**              | **~$19**       |
| Paid APIs (Gemini, Gradium, …)| usage-based    |

If the box is stopped between demos, compute drops to $0 — the EBS volume,
EIP, and SSM params persist (~$2/mo).

---

# Phase D1 — Containerize the apps

**Goal:** every app builds in a deterministic Docker image. Local
`docker compose up` boots `web + backend + voice-agent + caddy`.

### Checklist

- [ ] Detect the web framework: inspect `apps/web/package.json` for `next`
  vs `vite` and adjust the Dockerfile accordingly
- [ ] Add `apps/web/Dockerfile` (multi-stage; static framework → file-server,
  Next.js → `next start`)
- [ ] Add `apps/backend/Dockerfile` (Prisma client generated in build stage;
  SQLite file mounted at runtime; entrypoint runs `prisma migrate deploy`
  before starting Nest)
- [ ] Add `apps/voice-agent/Dockerfile` (includes the `@livekit/rtc-node`
  native binary in the runtime stage)
- [ ] Add a root `.dockerignore` excluding `node_modules`, `.env*`,
  `dev.db*`, build outputs, `.git/`, and any large local artifacts
- [ ] Add `infra/caddy/Caddyfile` with the routing rules
- [ ] Add `docker-compose.yml` at the repo root wiring all four services
- [ ] Add `docker-compose.local.override.yml` that exposes web/backend
  ports for direct local inspection and skips Caddy
- [ ] All three apps build with `docker compose build` from a clean
  checkout in under 5 minutes

### Multi-stage Dockerfile pattern (yarn workspaces)

Skeleton — tailor per app:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml* ./
COPY apps/<app>/package.json ./apps/<app>/
COPY packages/types/package.json ./packages/types/
COPY packages/app/package.json ./packages/app/
COPY packages/ui/package.json ./packages/ui/
RUN yarn install --immutable

FROM deps AS build
COPY . .
RUN yarn workspace @echoaway/types build \
 && yarn workspace @echoaway/<app> build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/<app>/dist ./apps/<app>/dist
COPY --from=build /app/apps/<app>/package.json ./apps/<app>/package.json
WORKDIR /app/apps/<app>
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

App-specific tweaks:

- **web** — if Vite, `runtime` is `caddy:2-alpine` serving the built
  `dist/` directory; the service then doesn't need a Node runtime at all.
  If Next.js, keep Node runtime and `CMD ["node", "node_modules/.bin/next", "start"]`.
- **backend** — copy `apps/backend/prisma/` into the runtime stage, run
  `npx prisma generate` in the build stage, and ship an entrypoint that
  runs `npx prisma migrate deploy` before `node dist/main.js`. Catalog
  seed runs once via a separate `docker compose run --rm backend yarn seed`
  command, not on every boot. Demo seed: same pattern with `yarn seed:demo`.
  Copy `dataset/` into the backend image — the seed scripts read it.
- **voice-agent** — first install of `@livekit/rtc-node` pulls a native
  binary; do this in the build stage so the runtime stage just copies
  `node_modules`. Confirm Alpine compatibility; fall back to
  `node:20-bookworm-slim` if `rtc-node` ships only glibc binaries.

### Caddyfile

```caddyfile
{
    email stephan@planaway.com
}

echoaway.com {
    reverse_proxy web:3000
    encode gzip
}

api.echoaway.com {
    reverse_proxy backend:3001
    encode gzip
}
```

### docker-compose.yml (root)

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [web, backend]

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    environment:
      - VITE_API_BASE_URL=https://api.echoaway.com
      - VITE_LIVEKIT_URL=${LIVEKIT_URL}

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    restart: unless-stopped
    environment:
      - DATABASE_URL=file:/data/dev.db
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - WEB_ORIGIN=https://echoaway.com
      - DEMO_PASSWORD=${DEMO_PASSWORD}
    volumes:
      - sqlite-data:/data

  voice-agent:
    build:
      context: .
      dockerfile: apps/voice-agent/Dockerfile
    restart: unless-stopped
    environment:
      - BACKEND_URL=http://backend:3001
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GRADIUM_API_KEY=${GRADIUM_API_KEY}
      - GRADIUM_VOICE_UID=${GRADIUM_VOICE_UID}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - AICOUSTICS_API_KEY=${AICOUSTICS_API_KEY}
      - SESSION_MAX_SECONDS=${SESSION_MAX_SECONDS:-180}

volumes:
  caddy-data:
  caddy-config:
  sqlite-data:
```

The compose file reads env vars from whatever `--env-file` is passed.
**Never commit a populated `.env`.** A `.env.example` mirroring the
existing root `.env.example` is fine.

### Agent prompt

```txt
Containerize the EchoAway monorepo for production deployment.

Inspect the codebase first:
- apps/web/package.json — determine framework (Next.js, Vite, etc.)
- apps/backend/package.json — confirm NestJS + Prisma; locate the build
  output directory (typically dist/)
- apps/voice-agent/package.json — confirm @livekit/agents + @livekit/rtc-node
- packages/{types,app,ui}/package.json — these are workspace deps each
  app may import; their package.json files must be copied during the
  `deps` stage so yarn can resolve the workspace graph

Tasks:
1. Write apps/web/Dockerfile, apps/backend/Dockerfile, apps/voice-agent/Dockerfile
   per the multi-stage skeleton in docs/Deployment.md "Phase D1". Tailor each
   per the app-specific notes in that section.
2. For the backend, write a small entrypoint script that runs
   `npx prisma migrate deploy` before exec'ing the Node process. Do NOT
   run seeds on boot — seeds are one-shot via `docker compose run`.
3. Write infra/caddy/Caddyfile per the doc.
4. Write docker-compose.yml at the repo root per the doc. Use named volumes
   for caddy-data, caddy-config, sqlite-data.
5. Write docker-compose.local.override.yml that:
   - exposes web on host :3000 and backend on host :3001 for direct access
   - removes the caddy service (so local dev doesn't need :443)
6. Write a root .dockerignore excluding node_modules/, .env*, dev.db*,
   **/dist/, .git/, .DS_Store. Verify that dataset/ is INCLUDED for the
   backend image (the catalog seed reads it).

Acceptance criteria:
- `docker compose build` succeeds from a clean checkout in under 5 minutes
- `docker compose -f docker-compose.yml -f docker-compose.local.override.yml up`
  with a populated .env starts all services healthy
- Image sizes: web < 200 MB (or < 50 MB if Vite + Caddy), backend < 300 MB,
  voice-agent < 400 MB
- No secrets in any Dockerfile or committed file
- prisma migrate deploy runs cleanly on backend container start
```

---

# Phase D2 — Local docker-compose smoke test

**Goal:** end-to-end verification that the same stack we'll deploy works
locally. Catches Dockerfile bugs before they hit AWS.

### Checklist

- [ ] Copy `.env.example` to `.env.local` and populate every var from
  developer credentials
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.override.yml --env-file .env.local up --build`
- [ ] Hit `http://localhost:3000` (web) — see the trip overview
- [ ] Hit `http://localhost:3001/health` (backend) — 200 OK
- [ ] Hit `http://localhost:3001/trips/by-phone/+4915112345678` — returns
  the seeded Barcelona trip (run `docker compose run --rm backend yarn seed`
  and `docker compose run --rm backend yarn seed:demo` first if needed)
- [ ] Tail `voice-agent` logs — see "agent registered with LiveKit Cloud"
- [ ] Trigger the demo flow end-to-end (mic → quote-change → confirmation
  card) **or** the deterministic replay (`docker compose run --rm voice-agent yarn replay`)
- [ ] `docker compose down` (without `-v`) keeps the SQLite volume; bring
  the stack back up and confirm trip data survived
- [ ] `docker compose down -v` cleans state; `docker compose up` rebuilds
  from a fresh seed

### Agent prompt

```txt
Run the docker-compose smoke test locally.

Steps:
1. Copy .env.example → .env.local. Fill every var from existing developer
   credentials (LIVEKIT_*, GEMINI_API_KEY, GRADIUM_API_KEY, GRADIUM_VOICE_UID,
   TAVILY_API_KEY, AICOUSTICS_API_KEY if present, DEMO_PASSWORD=set-anything).
2. Build + boot:
   docker compose -f docker-compose.yml -f docker-compose.local.override.yml \
     --env-file .env.local up --build
3. In a second shell, run the seeds against the running backend container:
   docker compose run --rm backend yarn seed
   docker compose run --rm backend yarn seed:demo
4. Health checks:
   - curl http://localhost:3001/health → 200
   - curl http://localhost:3001/trips/by-phone/+4915112345678 → seeded trip
   - browser http://localhost:3000 → trip renders
5. Run the demo flow if voice-agent is at PLAN.md Phase 5+. Otherwise run
   the replay path inside the voice-agent container and confirm SSE events
   arrive in the web UI.
6. Stop with `docker compose down` (no -v). Restart. Confirm trip data is
   still in SQLite.
7. Stop with `docker compose down -v`. Restart + reseed. Confirm clean state.

Stop on the first failure and report the failing step.

Acceptance criteria:
- All services run `Up` per `docker compose ps`
- Demo (or replay) flow completes against the local stack
- SQLite persistence verified across a restart without -v
- Clean state restorable via -v + reseed
```

---

# Phase D3 — AWS one-time bootstrap

**Goal:** create the AWS resources the EC2 box will depend on, before the
box itself.

### Checklist

- [ ] Pick an AWS region (recommend `eu-central-1` Frankfurt for Berlin demo)
- [ ] Buy `echoaway.com` via Route 53 *or* Cloudflare; create a Route 53
  public hosted zone for it either way
- [ ] Create IAM role `echoaway-ec2-role` with policies:
  - `AmazonSSMManagedInstanceCore` (SSM Session Manager + agent comms)
  - inline policy granting `ssm:GetParametersByPath` on
    `arn:aws:ssm:<region>:<acct>:parameter/echoaway/prod/*`
- [ ] Create an EC2 instance profile wrapping that role
- [ ] Create an EC2 key pair `echoaway-deploy` (or skip and use SSM Session
  Manager exclusively — recommended, no SSH port to defend)
- [ ] Create a security group `echoaway-sg`:
  - Inbound 22 from your IP only (or omit if SSM SM)
  - Inbound 80 from `0.0.0.0/0`
  - Inbound 443 from `0.0.0.0/0`
  - Outbound: all
- [ ] Allocate an Elastic IP labeled `echoaway-eip`
- [ ] Push every secret to SSM Parameter Store under `/echoaway/prod/`:

```bash
for var in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET \
           GEMINI_API_KEY GRADIUM_API_KEY GRADIUM_VOICE_UID \
           TAVILY_API_KEY AICOUSTICS_API_KEY DEMO_PASSWORD; do
  read -rs -p "$var: " val; echo
  aws ssm put-parameter \
    --name "/echoaway/prod/$var" \
    --type SecureString \
    --value "$val" \
    --region eu-central-1 \
    --overwrite
done
```

- [ ] Verify with `aws ssm get-parameters-by-path --path /echoaway/prod --recursive --with-decryption --region eu-central-1 | jq '.Parameters | length'`
- [ ] Record every resource ARN/ID in `infra/aws-resources.json` (gitignored)
  for later phases

### Agent prompt

```txt
Run the AWS one-time bootstrap for EchoAway.

Read docs/Deployment.md "Phase D3". Operate via AWS CLI v2.
Region: eu-central-1 unless told otherwise.

Important: this phase creates real AWS resources that cost money. Before
each `aws ... create-*` or `put-parameter` call, print the planned command
and the resource it creates, and confirm with the user. Do NOT auto-confirm.

For SSM secrets, ask the user to paste the value for each one. Do not read
from a local .env file (which may have stale dev credentials).

Capture every resource ID/ARN in infra/aws-resources.json (and add that
file to .gitignore). The next phases reference these.

Acceptance criteria:
- Route 53 hosted zone for echoaway.com exists; NS records noted
- IAM role echoaway-ec2-role + instance profile created
- Security group echoaway-sg with the documented inbound rules
- Elastic IP allocated; public IP recorded
- All secrets present in /echoaway/prod/, encrypted with the AWS-managed KMS key
- infra/aws-resources.json contains the IDs/ARNs needed by Phase D4
```

---

# Phase D4 — Provision the EC2 box

**Goal:** running Ubuntu 24.04 EC2 with Docker, repo cloned, secrets
fetched from SSM, and `docker compose up -d` running the stack.

### Checklist

- [ ] Launch `t3.small` Ubuntu 24.04 in the chosen region with:
  - 20 GB gp3 root volume
  - Security group `echoaway-sg`
  - Instance profile `echoaway-ec2-role`
  - User-data script (below)
- [ ] Associate the Elastic IP from Phase D3
- [ ] Wait for cloud-init (`/var/log/cloud-init-output.log` ends with
  `Cloud-init … finished`)
- [ ] Verify `systemctl status echoaway` is `active (exited)` and `docker
  compose ps` in `/srv/echoaway` shows all services Up
- [ ] Run seeds once: `docker compose run --rm backend yarn seed && docker
  compose run --rm backend yarn seed:demo`
- [ ] `curl -kI https://<elastic-ip>` returns 200/308 (cert is invalid for
  the IP — that's fine until DNS in Phase D5)

### user-data script

Drop this into the EC2 launch under "User data". It runs once on first
boot.

```bash
#!/usr/bin/env bash
set -euxo pipefail

REGION=eu-central-1
REPO_URL=https://github.com/<USER>/echoaway.git   # ← replace

# Docker
apt-get update
apt-get install -y ca-certificates curl gnupg jq unzip git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu

# AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip
unzip -q /tmp/awscli.zip -d /tmp
/tmp/aws/install

# App layout
install -d -o ubuntu -g ubuntu /srv/echoaway
sudo -u ubuntu git clone "$REPO_URL" /srv/echoaway

# SSM → .env loader
cat > /usr/local/bin/echoaway-load-env <<EOF
#!/usr/bin/env bash
set -euo pipefail
TMP=\$(mktemp)
aws ssm get-parameters-by-path \\
  --path /echoaway/prod \\
  --recursive --with-decryption \\
  --region $REGION \\
  --query 'Parameters[].[Name,Value]' \\
  --output text \\
  | awk -F'\\t' '{ name=\$1; sub(/^.*\\//, "", name); printf "%s=%s\\n", name, \$2 }' \\
  > "\$TMP"
install -m 600 -o ubuntu -g ubuntu "\$TMP" /srv/echoaway/.env
rm -f "\$TMP"
EOF
chmod +x /usr/local/bin/echoaway-load-env

# systemd: env loader (oneshot, runs before compose)
cat > /etc/systemd/system/echoaway-env.service <<'EOF'
[Unit]
Description=Load EchoAway secrets from SSM into .env
After=network-online.target
Wants=network-online.target
Before=echoaway.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/echoaway-load-env
RemainAfterExit=yes
EOF

# systemd: docker-compose wrapper
cat > /etc/systemd/system/echoaway.service <<'EOF'
[Unit]
Description=EchoAway docker-compose stack
Requires=echoaway-env.service docker.service
After=echoaway-env.service docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/srv/echoaway
ExecStart=/usr/bin/docker compose --env-file /srv/echoaway/.env up -d --build
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now echoaway-env.service
systemctl enable --now echoaway.service
```

If the repo is private, swap the `git clone` line for one of:

- HTTPS with a fine-grained GitHub deploy token stored as a separate SSM
  param, fetched in the user-data
- Bake the source into a tarball, upload to S3, `aws s3 cp` it down

### Agent prompt

```txt
Provision the EchoAway EC2 box per docs/Deployment.md "Phase D4".

Steps:
1. Replace the REPO_URL placeholder in the user-data script. If the repo is
   private, ask the user how they'd like to handle auth (deploy token via
   SSM, or S3 tarball) and adjust accordingly.
2. Launch the t3.small with the user-data, security group, instance profile,
   and key pair from Phase D3 (using IDs from infra/aws-resources.json).
3. Associate the Elastic IP.
4. Tail /var/log/cloud-init-output.log via SSM Session Manager
   (`aws ssm start-session --target i-...`) until cloud-init finishes
   without errors.
5. On the box, verify:
   - systemctl status echoaway-env.service → success
   - cat /srv/echoaway/.env | wc -l → ≥ 8 vars
   - cd /srv/echoaway && docker compose ps → all Up
6. Run the seeds once (catalog + demo trip).
7. From your laptop, curl -kI https://<elastic-ip> → 200/308.

Acceptance criteria:
- All 4 containers Up on the box
- /srv/echoaway/.env exists, mode 600, owned by ubuntu
- /var/log/cloud-init-output.log ends cleanly
- HTTP request to the Elastic IP reaches Caddy
- Seeded data queryable via the backend
```

---

# Phase D5 — DNS, domain, TLS

**Goal:** `https://echoaway.com` and `https://api.echoaway.com` resolve
and serve valid Let's Encrypt certs.

### Checklist

- [ ] In Route 53 hosted zone, create:
  - `A echoaway.com → <elastic-ip>`
  - `A api.echoaway.com → <elastic-ip>`
  - `A www.echoaway.com → <elastic-ip>` (optional; Caddy redirects to apex)
- [ ] If domain bought outside Route 53, set the registrar's NS records to
  the Route 53 hosted zone NS values
- [ ] Wait for propagation (`dig echoaway.com +short` returns the EIP)
- [ ] Hit `https://echoaway.com` and `https://api.echoaway.com/health` —
  Caddy provisions Let's Encrypt certs on first request (~30s)
- [ ] Verify cert validity in browser → green padlock
- [ ] Confirm `VITE_API_BASE_URL=https://api.echoaway.com` and
  `WEB_ORIGIN=https://echoaway.com` are in the SSM params; reload the
  stack: `sudo systemctl restart echoaway-env && sudo systemctl restart echoaway`

### Agent prompt

```txt
Configure DNS and verify TLS per docs/Deployment.md "Phase D5".

Steps:
1. Create the Route 53 A records pointing at the Elastic IP from Phase D3.
2. If the domain was bought outside Route 53, ask the user to update NS
   records at the registrar to the Route 53 NS values, then wait until
   `dig NS echoaway.com` returns the Route 53 NS set.
3. Verify resolution: `dig +short echoaway.com` and
   `dig +short api.echoaway.com` both return the Elastic IP.
4. Hit https://echoaway.com — first request takes ~30s while Caddy
   completes the ACME challenge. Subsequent requests are <100ms.
5. Verify https://api.echoaway.com/health returns 200 with a valid cert.
6. Update the SSM params for VITE_API_BASE_URL and WEB_ORIGIN to use the
   public hostnames; restart the compose stack on the box.

Acceptance criteria:
- Both hostnames serve valid Let's Encrypt certs (no warnings)
- /health returns 200 over HTTPS
- The web app loaded over HTTPS calls the backend cross-origin without
  CORS errors
```

---

# Phase D6 — Cost / abuse protection

**Goal:** a public URL that doesn't drain the Gemini, Gradium, or Tavily
budgets if it gets shared on Hacker News.

The voice path costs real money per call. **Do not skip this phase.**

### Checklist (implement at least the first two)

- [ ] **Shared password gate** on the web app's "Talk to Away" button.
  Web app prompts for a password; backend validates against `DEMO_PASSWORD`
  (already in SSM) before issuing a LiveKit token from `POST /voice/token`.
- [ ] **Per-session max duration** in `voice-agent`: `SESSION_MAX_SECONDS=180`.
  On expiry, emit `session_ended { reason: 'max_duration' }`, leave the
  room, write a SupportLog. Prevents stuck or trolling sessions from
  running up minutes.
- [ ] **Per-IP rate limit** on `POST /voice/token` (e.g., 3 sessions/IP/hour)
  via `@nestjs/throttler` reading `X-Forwarded-For` (Caddy sets this).
- [ ] **Daily session cap** in the backend: count `VoiceSession` rows
  created in the last 24h; if ≥ N (say 100), refuse new tokens with a
  friendly "demo limit reached" message.
- [ ] **API budget caps** in each provider's console:
  - Gemini (Google AI Studio / Vertex): project quota
  - Gradium: spending alert
  - Tavily: monthly cap
  - LiveKit Cloud: minutes cap
- [ ] **CloudWatch billing alert** at $50/$100/$200 thresholds for the AWS account

### Agent prompt

```txt
Implement EchoAway's cost / abuse protections per docs/Deployment.md "Phase D6".

Start with the two simplest items: shared password + per-session max duration.

Shared password:
1. Confirm DEMO_PASSWORD already exists in SSM (set in Phase D3). If not,
   ask the user for a value and put it.
2. apps/backend: add request validation on POST /voice/token that rejects
   bodies missing or with the wrong password. Return 401 otherwise. Use
   the same Zod-on-input pattern other endpoints use.
3. apps/web: on first "Talk to Away" click, prompt for password (modal),
   localStorage it after first success so demo viewers don't retype.
   Pass it to /voice/token in the request body.

Per-session max duration:
4. apps/voice-agent: read SESSION_MAX_SECONDS env var (default 180). On
   room join, set a timer; on expiry, emit `session_ended` with reason
   'max_duration', leave the room, POST createSupportLog with a stub
   summary.

Then the user manually configures provider-side budget caps via dashboards
and CloudWatch billing alerts; ask them to confirm each.

Acceptance criteria:
- Anonymous POST /voice/token returns 401
- Correct password issues a LiveKit access token
- Sessions auto-terminate at 3 minutes; SupportLog written on timeout
- Provider budgets confirmed by the user (chat reply, screenshots optional)
```

---

# Phase D7 — Deploy & update workflow

**Goal:** push code changes from local to production in one command, no
SSH.

### Checklist

- [ ] Add `infra/scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
INSTANCE_ID="${ECHOAWAY_INSTANCE_ID:?set ECHOAWAY_INSTANCE_ID}"
REGION="${AWS_REGION:-eu-central-1}"
CMD_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "EchoAway deploy" \
  --parameters '{"commands":[
    "set -euo pipefail",
    "cd /srv/echoaway",
    "sudo -u ubuntu git fetch --all",
    "sudo -u ubuntu git reset --hard origin/main",
    "sudo systemctl start echoaway-env.service",
    "sudo -u ubuntu docker compose --env-file /srv/echoaway/.env up -d --build"
  ]}' \
  --output text --query "Command.CommandId")
echo "CommandId: $CMD_ID"
aws ssm wait command-executed \
  --command-id "$CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$REGION"
echo "Deploy succeeded."
```

- [ ] `chmod +x infra/scripts/deploy.sh`
- [ ] Document `ECHOAWAY_INSTANCE_ID`, `AWS_REGION`, `AWS_PROFILE` in
  `.env.example` for local devs running deploys
- [ ] Test: trivial change in `apps/web`, commit + push, run
  `infra/scripts/deploy.sh`, verify in <2 min
- [ ] Document rollback in `infra/scripts/README.md`:
  `aws ssm send-command ... reset --hard <previous-sha> ...`

### Agent prompt

```txt
Wire up the deploy script and prove it round-trips. See docs/Deployment.md
"Phase D7".

Steps:
1. Write infra/scripts/deploy.sh per the doc; chmod +x.
2. Update root README "How to deploy" with: required env vars
   (ECHOAWAY_INSTANCE_ID, AWS_REGION, AWS_PROFILE), example invocation,
   how to tail the live logs via SSM Session Manager, rollback recipe.
3. Make a no-op change in apps/web (add a deploy-test comment), commit,
   push to main.
4. Run infra/scripts/deploy.sh; capture the SSM CommandId.
5. The script waits for completion. Confirm the change is live at
   https://echoaway.com.
6. Revert the no-op change locally and redeploy to prove rollback works.

Acceptance criteria:
- Deploy completes in under 2 minutes from `git push` to live
- SSM command logs show no errors (`aws ssm get-command-invocation`)
- Rollback via local `git reset` + redeploy works
- README has a clear "How to deploy" section
```

---

# Phase D8 (optional) — GitHub Actions auto-deploy

**Goal:** every push to `main` redeploys, no laptop required.

### Checklist

- [ ] Configure GitHub OIDC trust: create IAM role `echoaway-gha` with a
  trust policy for `token.actions.githubusercontent.com` scoped to
  `repo:<USER>/echoaway:ref:refs/heads/main`
- [ ] Attach a policy granting `ssm:SendCommand` on the EC2 instance ARN
  and the `AWS-RunShellScript` document, plus
  `ssm:GetCommandInvocation` on `*`
- [ ] Add the instance ID as a GitHub repo *variable* `ECHOAWAY_INSTANCE_ID`
- [ ] Add `.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
concurrency: { group: deploy, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<acct>:role/echoaway-gha
          aws-region: eu-central-1
      - run: |
          CMD_ID=$(aws ssm send-command \
            --instance-ids ${{ vars.ECHOAWAY_INSTANCE_ID }} \
            --document-name AWS-RunShellScript \
            --comment "GHA deploy ${{ github.sha }}" \
            --parameters 'commands=["cd /srv/echoaway && sudo -u ubuntu git fetch --all && sudo -u ubuntu git reset --hard ${{ github.sha }} && sudo systemctl start echoaway-env.service && sudo -u ubuntu docker compose --env-file /srv/echoaway/.env up -d --build"]' \
            --output text --query "Command.CommandId")
          echo "CommandId: $CMD_ID"
          aws ssm wait command-executed \
            --command-id "$CMD_ID" \
            --instance-id ${{ vars.ECHOAWAY_INSTANCE_ID }}
```

- [ ] Push and observe the workflow run

### Agent prompt

```txt
Set up GitHub Actions auto-deploy per docs/Deployment.md "Phase D8".

Strongly prefer OIDC; do NOT create long-lived AWS access keys.

Steps:
1. Create IAM role echoaway-gha trusted by token.actions.githubusercontent.com
   with the SSM SendCommand + GetCommandInvocation policy scoped to the
   instance ARN and AWS-RunShellScript document.
2. Add ECHOAWAY_INSTANCE_ID as a GitHub repo variable.
3. Write .github/workflows/deploy.yml per the doc.
4. Push a no-op commit. Observe the run. Confirm the live site reflects it.

Acceptance criteria:
- Workflow turns green within 3 minutes of `git push origin main`
- No AWS access keys in repo or GitHub secrets
- Deploy is idempotent (rerunning on the same SHA succeeds)
- Concurrent deploys are serialized (no race)
```

---

## 12. Operations runbook

### Tail logs

```bash
aws ssm start-session --target <instance-id> --region eu-central-1
# then on the box:
cd /srv/echoaway
docker compose logs -f --tail=200
docker compose logs -f voice-agent
```

### Restart one service

```bash
docker compose restart backend
```

### Rotate a secret

1. Update the value in SSM Parameter Store.
2. `sudo systemctl start echoaway-env.service` (re-fetches into `.env`).
3. `sudo systemctl restart echoaway` (re-runs `docker compose up -d`).

### Free disk space

```bash
docker system prune -af   # safe — leaves named volumes
docker volume prune       # ⚠ removes unused volumes; check first
```

### Snapshot the SQLite database

```bash
aws ec2 create-snapshot --volume-id vol-... --description "echoaway pre-talk"
```

Schedule daily snapshots with EBS Lifecycle Manager once the demo is live.

### Suspend the demo (stop billing for compute)

```bash
aws ec2 stop-instances --instance-ids i-... --region eu-central-1
```

EIP, EBS, and SSM params persist; restarting brings the stack back without
re-provisioning.

### Update the box's OS

```bash
sudo unattended-upgrade -d
sudo reboot   # if a kernel update landed
```

`echoaway.service` restarts on boot.

---

## 13. Out of scope

This deploy explicitly does **not** include:

- Multi-AZ / multi-region failover
- Autoscaling — single fixed instance
- Blue/green or canary deploys (`docker compose up -d --build` does in-place
  rebuild; expect ~10s of unavailability during deploy)
- A managed database — SQLite on EBS is fine for demos, terrible for production
- WAF / DDoS protection beyond Caddy's defaults
- Centralized log aggregation — CloudWatch Logs agent is a 5-minute add when
  needed
- VPC isolation / private subnets / NAT — the box runs in the default VPC
  public subnet
- Container image registry — images are built on the box from source
  (slower deploys, no ECR cost)
- Per-PR preview environments

If the demo outlives the hackathon and grows real users, revisit this list.

---

## See also

- [`../PLAN.md`](../PLAN.md) — the build plan; this doc runs *after*
  PLAN.md Phase 9, or in parallel once Phase 5+ apps are running
- [`./runtime-flow.md`](./runtime-flow.md) — the control + audio paths the
  deployment must preserve
- [`./seed-strategy.md`](./seed-strategy.md) — the seed scripts that
  Phase D4 runs once per box
