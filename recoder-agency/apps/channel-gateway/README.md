# Channel Gateway

Entry point for multi-channel client communication (Slack/WhatsApp/Telegram/Discord).

## Scripts
- `pnpm -C recoder-agency/apps/channel-gateway dev`
- `pnpm -C recoder-agency/apps/channel-gateway build`
- `pnpm -C recoder-agency/apps/channel-gateway start`

## Env
See `.env.example`.

## Webhooks
- `POST /webhooks/:provider` where provider is `slack|whatsapp|telegram|discord`
- `GET /healthz` for liveness

## Slack setup
- Set `SLACK_SIGNING_SECRET`
- Set `SLACK_BOT_TOKEN` for outbound replies
- Configure your Slack app to send events to `POST /webhooks/slack`
- Configure interactive components to `POST /webhooks/slack/actions`
- Enable interactivity + modals (views.open) for rejection reasons

## Slack auth (production)
You should implement Slack OAuth in the Agency app:
- Install the Slack app per team
- Store bot token + workspace id on the team record
- Route messages to the right team using workspace id

## Agency dispatch
The gateway forwards normalized messages to:
- `POST /api/channel-gateway/messages`

Required env:
- `CHANNEL_GATEWAY_AGENCY_URL`
- `CHANNEL_GATEWAY_SHARED_SECRET`

### Command syntax (current)
- `link client:<clientId>` → links Slack user to a client
- `help` → lists available commands
- `brief: <text>` → creates a draft project
- `revision: <text>` → creates a change order (latest project unless `project:<id>` is provided)
- `status` → returns latest project status (gateway logs response)
- `list projects` → shows latest projects
- `list projects page 2` → paginates projects
- `approve deliverable:<id>`
- `reject deliverable:<id> reason:<text>`
- `approve milestone:<label>`
- `reject milestone:<label> reason:<text>`
- `approve change order:<id>`
- `reject change order:<id> reason:<text>`
