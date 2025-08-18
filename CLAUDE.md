# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitPing is a real-time notification service for GitHub repositories built on Cloudflare Workers. It sends instant alerts via Telegram (and other channels in the future) when new releases or commits happen in subscribed repositories.

## Architecture

The system uses a microservices architecture with three Cloudflare Workers:

- **API Worker** (`src/workers/api.ts`): REST API for managing subscriptions and user accounts
- **Poller Worker** (`src/workers/poller.ts`): Cron-based GitHub polling service
- **Notifier Worker** (`src/workers/notifier.ts`): Queue consumer for sending notifications

### Key Components

- **Database**: Cloudflare D1 (SQLite) for persistent storage
- **State Management**: Cloudflare KV for polling state (ETags, last-seen IDs)
- **Message Queue**: Cloudflare Queues for decoupling event processing
- **External APIs**: GitHub REST API, Telegram Bot API

## Development Commands

```bash
# Install dependencies
npm install

# Local development
npm run dev:api          # Start API worker locally
npm run dev:poller       # Start poller worker locally

# Deployment
npm run deploy           # Deploy both workers
npm run deploy:prod      # Deploy to production

# Individual deployments  
npm run deploy:api       # Deploy API worker
npm run deploy:poller    # Deploy poller worker

# Database migrations
npm run db:migrate:local # Local D1 database
npm run db:migrate       # Remote D1 database

# Monitoring
npm run logs:api         # Tail API worker logs
npm run logs:poller      # Tail poller worker logs
```

## Database Schema

Located in `src/schema.sql`. Key tables:
- `users`: User accounts and Telegram chat IDs
- `repos`: GitHub repository tracking
- `subscriptions`: User subscriptions to repos/events
- `events`: GitHub events (releases/commits) 
- `notifications`: Delivery tracking

## Configuration Files

- `wrangler-api.toml`: API worker configuration
- `wrangler-poller.toml`: Poller worker configuration with cron triggers
- `.env`: Environment-specific IDs (not committed to git)
- `.env.example`: Template for environment setup

## Code Structure

- `src/lib/`: Core business logic (GitHub API, Telegram API, Database)
- `src/workers/`: Worker entry points
- `src/utils/`: Utilities (logging, error handling, filters)

## Setup Requirements

See `setup.md` for complete setup instructions. You'll need:
- Cloudflare account with D1 and KV enabled
- GitHub personal access token (public_repo scope)
- Telegram bot token from @BotFather

Current deployment uses free plan (no Queues) with inline notification processing.

## Common Tasks

- Adding new notification channels: Implement in `src/workers/notifier.ts`
- Adding new filters: Extend `src/utils/filters.ts`
- API changes: Modify `src/workers/api.ts` and update types in `src/lib/types.ts`
- Polling changes: Modify `src/workers/poller.ts`

## Testing

Use the API endpoints to create test subscriptions. Monitor with `wrangler tail <worker-name>`.