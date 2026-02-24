# GitPing

**Instant GitHub release notifications via Telegram** 📦 → 📱

Get notified the moment your favorite repositories release new versions. Built on Cloudflare Workers for global scale and reliability.

## ✨ Features

- 🔔 **Real-time notifications** for GitHub releases
- 🤖 **Telegram bot interface** - chat to manage subscriptions
- 🎛️ **Smart filters** - exclude prereleases, regex patterns
- 🌍 **Global edge deployment** via Cloudflare Workers
- 🆓 **Free tier friendly** - works on Cloudflare's free plan
- ⚡ **ETag caching** for efficient GitHub API usage
- 🛡️ **Secure** - no hardcoded secrets, encrypted storage

## 🚀 Quick Start

### Prerequisites

- Cloudflare account (free tier works)
- GitHub personal access token (`public_repo` scope)
- Telegram bot (created via @BotFather)

### Installation

1. **Clone and install:**

   ```bash
   git clone <your-repo>
   cd gitping
   npm install
   ```

2. **Create Cloudflare resources:**

   ```bash
   wrangler d1 create gitping
   ```

3. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your database ID from step 2
   ```

4. **Generate config files:**

   ```bash
   npm run setup
   ```

5. **Initialize database:**

   ```bash
   npm run db:migrate
   ```

6. **Set API secrets:**

   ```bash
   wrangler secret put GITHUB_TOKEN --config wrangler-api.toml
   wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler-api.toml
   wrangler secret put GITHUB_TOKEN --config wrangler-poller.toml
   wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler-poller.toml
   ```

7. **Deploy:**

   ```bash
   npm run deploy
   ```

8. **Set up Telegram webhook:**
   ```bash
   export TELEGRAM_BOT_TOKEN=your_bot_token
   npm run telegram:setup
   ```

## 🤖 Using the Telegram Bot

### Getting Started

1. Find your bot in Telegram (search for its @username)
2. Send `/start` to begin
3. Use the interactive buttons or commands below

### Bot Commands

- `/subscribe owner/repo` - Subscribe to repository releases
- `/list` - View your active subscriptions
- `/unsubscribe <id>` - Remove a subscription
- `/status` - Check account info
- `/help` - Show available commands

### Example Usage

```
You: /subscribe microsoft/vscode
Bot: ✅ Successfully subscribed! You'll get notifications when
     Microsoft VS Code publishes new releases.

You: /list
Bot: 📋 Your Subscriptions (1)
     1. microsoft/vscode • ID: 123

You: /unsubscribe 123
Bot: ✅ Subscription removed successfully!
```

## 🏗️ Architecture

- **API Worker**: REST endpoints + Telegram bot handler
- **Poller Worker**: Cron-based GitHub polling (every minute)
- **Database**: Cloudflare D1 (SQLite) for persistence
- **Polling State**: Cloudflare D1 table (`repo_poll_states`) for ETags and last-seen release IDs
- **Queue**: Inline processing (queue-based on paid plans)

## 🛠️ Development

### Local Development

```bash
npm run dev:api          # Start API worker locally
npm run dev:poller       # Start poller worker locally
```

### Deployment

```bash
npm run deploy           # Deploy both workers
npm run deploy:prod      # Deploy to production
```

### Frontend Deployment (Cloudflare Pages)

#### Build Settings

- **Framework preset**: `Next.js (Static HTML Export)`
- **Build command**: `cd web && npm run build`
- **Build output directory**: `web/out`
- **Node.js version**: `18` or `20`

#### Environment Variables

Add in Cloudflare Pages settings:

- **NEXT_PUBLIC_API_URL**: `your_api_url`

#### GitHub OAuth Configuration

Update your GitHub OAuth app with:

- **Homepage URL**: `your_url`
- **Authorization callback URL**: `your_api_url`

### Monitoring

```bash
npm run logs:api         # Tail API worker logs
npm run logs:poller      # Tail poller worker logs
```

### Database Management

```bash
npm run db:migrate       # Run migrations on remote database
npm run db:migrate:local # Run migrations locally
```

## 📊 API Endpoints

For advanced users and integrations:

```bash
# Health check
GET /health

# Subscription management
POST /subscriptions
GET /subscriptions?user_id=<id>
DELETE /subscriptions/<id>?user_id=<id>

# Event history
GET /events?repo=owner/name&limit=10

# Telegram integration
POST /webhook/telegram
POST /connect/telegram
```

## 🔧 Configuration

GitPing uses a template-based configuration system:

### Files in Git

- `wrangler-api.template.toml` - API worker template
- `wrangler-poller.template.toml` - Poller worker template
- `.env.example` - Environment template

### Generated Files (Git ignored)

- `wrangler-api.toml` - Generated with your IDs
- `wrangler-poller.toml` - Generated with your IDs
- `.env` - Your actual environment variables

### Environment Variables

```bash
# Required
D1_DATABASE_ID=your_database_id

# Optional (for multiple environments)
D1_DATABASE_ID_PROD=your_prod_database_id
```

## 🛡️ Security Features

✅ **Template-based config** - No hardcoded IDs in version control  
✅ **Encrypted secrets** - API tokens stored as Worker secrets  
✅ **Environment isolation** - Separate resources for dev/staging/prod  
✅ **Input validation** - Repository and user data validation  
✅ **Rate limiting** - GitHub API usage monitoring

## 🎯 Example: Getting Your First Notification

1. **Deploy GitPing** (follow Quick Start above)
2. **Start your bot** in Telegram and send `/start`
3. **Subscribe**: `/subscribe vercel/next.js`
4. **Wait**: When Next.js releases a new version, you'll get:

```
📦 vercel/next.js — new release v14.1.0
• Next.js 14.1.0
• Bug fixes and performance improvements...

https://github.com/vercel/next.js/releases/tag/v14.1.0
```

## 🔍 Troubleshooting

### Bot doesn't respond

- Check webhook setup: `npm run telegram:setup`
- Verify API worker is deployed and healthy

### "Repository not found"

- Ensure repository name is correct: `owner/repo`
- Repository must be public
- Check GitHub token has `public_repo` scope

### No notifications received

- Check poller logs: `npm run logs:poller`
- Verify GitHub token is set as Worker secret
- Ensure subscription was created successfully

### Configuration issues

- Regenerate config files: `npm run setup`
- Check your `.env` file has the correct IDs
- Verify resources exist: `wrangler d1 list`

## 📁 Project Structure

```
├── src/
│   ├── workers/              # Worker entry points
│   │   ├── api.ts           # API + Telegram bot handler
│   │   └── simple-poller.ts # GitHub polling worker
│   ├── lib/                 # Core business logic
│   │   ├── github.ts        # GitHub API client
│   │   ├── telegram.ts      # Telegram API client
│   │   ├── telegram-bot.ts  # Bot command handler
│   │   └── db.ts           # Database operations
│   └── utils/               # Utilities
├── scripts/                 # Setup and deployment scripts
├── wrangler-*.template.toml # Configuration templates
└── .env.example            # Environment template
```

## 🎛️ Advanced Configuration

### Custom Filters

```json
{
  "filters": {
    "include_prereleases": false,
    "tag_regex": "^v\\d+\\.\\d+\\.\\d+$"
  }
}
```

### Multiple Environments

Create separate resources for production:

```bash
wrangler d1 create gitping-prod
# Add IDs to .env as D1_DATABASE_ID_PROD, etc.
npm run deploy:prod
```

## 🎊 Success Stories

GitPing is perfect for:

- **Developers** tracking framework updates
- **DevOps teams** monitoring tool releases
- **Security teams** watching vulnerability patches
- **Open source maintainers** staying updated on dependencies

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**GitPing** - _Never miss a release again_ 🎯

Built with ❤️ using Cloudflare Workers, TypeScript, and Telegram Bot API.
