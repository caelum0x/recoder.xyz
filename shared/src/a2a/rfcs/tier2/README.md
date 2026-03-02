# Tier-2 Connector RFC Pack

This directory is the canonical RFC pack for Tier-2 A2A connectors.

Connectors in scope:
- `cursor`
- `windsurf`
- `replit`
- `vscode-copilot`
- `jetbrains`

Files:
- `TEMPLATE.md` - baseline RFC template for new connectors
- `cursor.md` - draft RFC with policy mapping
- `windsurf.md` - draft RFC with policy mapping
- `replit.md` - draft RFC with policy mapping
- `vscode-copilot.md` - draft RFC with policy mapping
- `jetbrains.md` - draft RFC with policy mapping

Promotion gate:
- Use `node tools/a2a-interop/js/validate-tier2-promotion.mjs --all`
- For strict promotion assertions:
  `node tools/a2a-interop/js/validate-tier2-promotion.mjs --connector <id> --assert-promotable`

