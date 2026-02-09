<div align="center">

  <span style="font-size: 18px; color: #666; margin-left: 15px;">Recoder Agency — AI-powered project delivery for agencies</span>

</div>

## Introduction

Recoder Agency is a platform for agencies to manage client projects powered by AI workflows. Built on an open-source AI workflow engine, it enables seamless human-AI collaboration for project delivery.

## Quick Start

Get Recoder Agency running locally:

```bash
# Clone the repository
git clone https://github.com/your-org/recoder-agency.git
cd recoder-agency

# Install dependencies
pnpm install

# Build SDK packages
pnpm build-sdk

# Create environment file
cp apps/agency/.env.example apps/agency/.env.local

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and start building.

> **Note**: You need at least one AI provider API key. Supported providers: OpenAI, Anthropic, Google AI.

## Features

- **Visual Agent Builder** - Create and modify agents using an intuitive drag-and-drop interface
- **Multi-Model Composition** - Leverage GPT, Claude, Gemini, and more
- **Client Portal** - Dedicated portal for clients to submit briefs, review deliverables, and track projects
- **Project Management** - Kanban-style project tracking with status workflows
- **Invoice & Billing** - Stripe-integrated invoicing per project
- **Knowledge Store** - Access and search your code and data from one place
- **Team Collaboration** - Shared configurations and contextual awareness

## Architecture

Recoder Agency uses a Turborepo monorepo with pnpm workspaces:

```
recoder-agency/
  apps/agency/       # Next.js application
  packages/          # SDK packages
  internal-packages/ # Internal shared packages
```

## License

Licensed under the [Apache License Version 2.0](LICENSE).

Licenses for third-party packages can be found in [docs/packages-license.md](docs/packages-license.md).
