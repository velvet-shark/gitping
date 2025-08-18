# GitPing Web Frontend

Next.js frontend for GitPing - GitHub release notification service.

## Features

- GitHub OAuth authentication
- Dashboard to manage repository subscriptions
- Telegram channel connection via 6-digit codes
- Responsive design with Tailwind CSS
- Static site generation for optimal performance

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Export static files
npm run export
```

## Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_API_URL=https://gitping-api.modelarena.workers.dev
```

## Deployment to Cloudflare Pages

1. Build and export the static site:
   ```bash
   npm run export
   ```

2. The `out/` directory contains the static files ready for deployment.

3. Deploy to Cloudflare Pages:
   - Connect your GitHub repository
   - Set build command: `npm run export`
   - Set build output directory: `out`
   - Add environment variable: `NEXT_PUBLIC_API_URL`

## Architecture

- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Static Site Generation** for optimal performance on Cloudflare Pages

## Pages

- `/` - Landing page
- `/auth/login` - GitHub OAuth login
- `/auth/callback` - OAuth callback handler
- `/dashboard` - User dashboard with subscriptions

## API Integration

The frontend communicates with the GitPing API worker for:
- GitHub OAuth flow
- User authentication (JWT)
- Subscription management
- Telegram connection codes