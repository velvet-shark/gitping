# GitPing Production Deployment

## 🚀 Cloudflare Pages Configuration

When setting up Cloudflare Pages, use these exact settings:

### Build Settings
- **Framework preset**: `Next.js (Static HTML Export)`
- **Build command**: `cd web && npm run build`
- **Build output directory**: `web/out`
- **Node.js version**: `18` or `20`

### Environment Variables
Add this environment variable in Cloudflare Pages settings:
- **Variable**: `NEXT_PUBLIC_API_URL`
- **Value**: `https://gitping-api.modelarena.workers.dev`

### Domain Settings
After deployment, you'll get a domain like:
- `https://gitping-abc123.pages.dev`

## 🔧 GitHub OAuth Application Settings

Update your GitHub OAuth app (created in Step 1) with:
- **Homepage URL**: `https://your-actual-pages-domain.pages.dev`
- **Authorization callback URL**: `https://gitping-api.modelarena.workers.dev/auth/callback`

## ✅ Deployment Verification

After deployment, test:
1. Visit your Pages domain
2. Click "Sign In with GitHub"  
3. Should redirect to GitHub for authorization
4. After approval, should redirect to your dashboard

## 🔗 Live URLs
- **Frontend**: https://your-pages-domain.pages.dev
- **API**: https://gitping-api.modelarena.workers.dev
- **Poller**: https://gitping-poller.modelarena.workers.dev (runs automatically)

## 🎯 Current Status
- ✅ API Worker deployed with authentication
- ✅ Poller Worker deployed and running every minute
- ✅ Database migrated with authentication tables
- ✅ Frontend built and ready for deployment
- ⏳ Waiting for Cloudflare Pages deployment