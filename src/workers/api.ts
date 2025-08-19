import type { Env, CreateSubscriptionRequest, ConnectTelegramRequest, GitHubOAuthCallbackRequest, AuthResponse, GenerateConnectionCodeResponse, LinkTelegramRequest } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';
import { AuthService } from '../lib/auth';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const db = new DatabaseService(env);
    const github = new GitHubAPI(env);
    const auth = new AuthService(env);

    try {
      // CORS headers for web clients
      const origin = request.headers.get('Origin') || '*';
      const corsHeaders = {
        'Access-Control-Allow-Origin': origin.includes('gitping.pages.dev') || origin.includes('localhost') ? origin : '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      };

      // Helper function to authenticate user (supports both JWT and direct user_id)
      async function authenticateUser(request: Request, bodyUserId?: string): Promise<{ success: boolean; userId?: string; error?: string }> {
        // Try JWT authentication first
        const token = auth.extractToken(request);
        if (token) {
          const payload = await auth.verifyJWT(token);
          if (payload) {
            const session = await db.getSession(payload.jti);
            if (session) {
              await db.updateSessionLastUsed(payload.jti);
              return { success: true, userId: payload.sub };
            }
          }
          return { success: false, error: 'Invalid or expired token' };
        }

        // Fallback to direct user_id (for Telegram bot and backward compatibility)
        if (bodyUserId) {
          return { success: true, userId: bodyUserId };
        }

        return { success: false, error: 'Authentication required' };
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Authentication endpoints
      // GET /auth/github - Initiate GitHub OAuth flow
      if (request.method === 'GET' && url.pathname === '/auth/github') {
        const state = auth.generateRandomString(16);
        // Use the current request origin for the callback URL
        const apiUrl = `${url.protocol}//${url.host}`;
        const oauthURL = auth.getGitHubOAuthURL(state, apiUrl);
        
        return new Response(JSON.stringify({ url: oauthURL, state }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // GET /auth/callback - Handle GitHub OAuth callback  
      if (request.method === 'GET' && url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code) {
          // Redirect to frontend login with error
          const frontendUrl = env.FRONTEND_URL || 'https://gitping.pages.dev';
          
          return new Response(null, {
            status: 302,
            headers: { 
              'Location': `${frontendUrl}/auth/login?error=${encodeURIComponent('No authorization code provided')}`,
              ...corsHeaders 
            }
          });
        }

        try {
          // Exchange code for access token
          const accessToken = await auth.exchangeGitHubCode(code);
          if (!accessToken) throw new Error('Failed to exchange code for access token');

          // Get GitHub user info
          const [githubUser, emails] = await Promise.all([
            auth.getGitHubUser(accessToken),
            auth.getGitHubUserEmails(accessToken)
          ]);

          if (!githubUser) throw new Error('Failed to get GitHub user info');

          // Find primary email
          const primaryEmail = emails?.find(e => e.primary)?.email || githubUser.email;

          // Create or update user
          const user = await db.createOrUpdateGitHubUser(githubUser, primaryEmail);

          // Create session
          const sessionId = auth.generateRandomString();
          const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
          
          await db.createSession(
            sessionId, 
            user.id, 
            expiresAt,
            request.headers.get('User-Agent') || undefined,
            request.headers.get('CF-Connecting-IP') || undefined
          );

          // Generate JWT token
          const token = await auth.createJWT(user.id, sessionId);

          // Redirect to frontend auth callback with token
          const frontendUrl = env.FRONTEND_URL || 'https://gitping.pages.dev';
          
          return new Response(null, {
            status: 302,
            headers: { 
              'Location': `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`,
              ...corsHeaders 
            }
          });

        } catch (error) {
          // Redirect to frontend login with error message
          const frontendUrl = env.FRONTEND_URL || 'https://gitping.pages.dev';
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          
          return new Response(null, {
            status: 302,
            headers: { 
              'Location': `${frontendUrl}/auth/login?error=${encodeURIComponent(errorMessage)}`,
              ...corsHeaders 
            }
          });
        }
      }

      // POST /auth/logout - Clear session
      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        const token = auth.extractToken(request);
        
        if (token) {
          const payload = await auth.verifyJWT(token);
          if (payload) {
            await db.deleteSession(payload.jti);
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            'Content-Type': 'application/json',
            'Set-Cookie': auth.createLogoutCookie(),
            ...corsHeaders 
          }
        });
      }

      // GET /auth/me - Get current user info
      if (request.method === 'GET' && url.pathname === '/auth/me') {
        const token = auth.extractToken(request);
        
        if (!token) {
          return new Response(JSON.stringify({ success: false, error: 'No token provided' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const payload = await auth.verifyJWT(token);
        if (!payload) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Verify session still exists
        const session = await db.getSession(payload.jti);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Update last used timestamp
        await db.updateSessionLastUsed(payload.jti);

        // Get user info
        const user = await db.getUser(payload.sub);
        if (!user) {
          return new Response(JSON.stringify({ success: false, error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const response: AuthResponse = { success: true, user };
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // POST /auth/connection-code - Generate Telegram connection code
      if (request.method === 'POST' && url.pathname === '/auth/connection-code') {
        const token = auth.extractToken(request);
        
        if (!token) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const payload = await auth.verifyJWT(token);
        if (!payload) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Generate connection code (expires in 10 minutes)
        const code = auth.generateConnectionCode();
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 60);
        
        console.log(`Creating connection code ${code} for user ${payload.sub}`);
        await db.createConnectionCode(code, payload.sub, expiresAt);

        const response: GenerateConnectionCodeResponse = { code, expires_at: expiresAt };
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // POST /subscriptions - Create a new subscription
      if (request.method === 'POST' && url.pathname === '/subscriptions') {
        const body: CreateSubscriptionRequest = await request.json();
        
        // Authenticate user
        const authResult = await authenticateUser(request, body.user_id);
        if (!authResult.success) {
          return new Response(JSON.stringify({ error: authResult.error }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Validate input
        if (!body.repo || !body.kind || !body.channels?.length) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const [owner, name] = body.repo.split('/');
        if (!owner || !name) {
          return new Response(JSON.stringify({ error: 'Invalid repo format. Use owner/name' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Validate repo exists
        try {
          await github.getRepository(owner, name);
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Repository not found or not accessible' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Create or get repo
        const repoId = await db.createRepo(owner, name);
        
        // Create or get user (required for foreign key constraint)
        await db.createUser(authResult.userId!);
        
        // Create subscription
        const subscriptionId = await db.createSubscription(
          authResult.userId!,
          repoId,
          body.kind,
          body.filters || {},
          body.channels
        );

        // Fetch latest release info for the new subscription
        let last_release = null;
        try {
          const result = await github.getReleases(owner, name);
          const releases = result.releases;
          
          if (releases && releases.length > 0) {
            const release = releases[0];
            last_release = {
              tag_name: release.tag_name,
              published_at: release.published_at,
              html_url: release.html_url
            };
          }
        } catch (error) {
          console.log(`Failed to fetch releases for ${owner}/${name}:`, error);
          // Continue without release info if fetch fails
        }

        // Return complete subscription object
        const newSubscription = {
          id: subscriptionId,
          repo: `${owner}/${name}`,
          kind: body.kind,
          filters: body.filters || {},
          channels: body.channels,
          created_at: Math.floor(Date.now() / 1000),
          last_release
        };

        return new Response(JSON.stringify({ 
          ...newSubscription,
          message: 'Subscription created successfully' 
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // GET /subscriptions - Get user's subscriptions
      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        // Authenticate user (support both JWT and user_id parameter)
        const userIdParam = url.searchParams.get('user_id');
        const authResult = await authenticateUser(request, userIdParam);
        if (!authResult.success) {
          return new Response(JSON.stringify({ error: authResult.error }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const subscriptions = await db.getUserSubscriptions(authResult.userId!);
        
        // Fetch latest release info for each repository
        const response = await Promise.all(subscriptions.map(async (sub) => {
          let last_release = null;
          
          try {
            // Get latest release from GitHub API
            const result = await github.getReleases(sub.owner, sub.name);
            const releases = result.releases;
            if (releases && releases.length > 0) {
              const release = releases[0];
              last_release = {
                tag_name: release.tag_name,
                published_at: release.published_at,
                html_url: release.html_url
              };
            }
          } catch (error) {
            console.log(`Failed to fetch releases for ${sub.owner}/${sub.name}:`, error);
            // Continue without release info if fetch fails
          }

          return {
            id: sub.id,
            repo: `${sub.owner}/${sub.name}`,
            kind: sub.kind,
            filters: JSON.parse(sub.filters_json),
            channels: JSON.parse(sub.channels_json),
            created_at: sub.created_at,
            last_release
          };
        }));

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // DELETE /subscriptions/:id - Delete a subscription
      if (request.method === 'DELETE' && url.pathname.startsWith('/subscriptions/')) {
        const subscriptionId = parseInt(url.pathname.split('/')[2]);
        const userIdParam = url.searchParams.get('user_id');

        // Authenticate user
        const authResult = await authenticateUser(request, userIdParam);
        if (!authResult.success) {
          return new Response(JSON.stringify({ error: authResult.error }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        if (isNaN(subscriptionId)) {
          return new Response(JSON.stringify({ error: 'Invalid subscription ID' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const deleted = await db.deleteSubscription(subscriptionId, authResult.userId!);
        
        if (deleted) {
          return new Response(JSON.stringify({ message: 'Subscription deleted' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Subscription not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }

      // POST /connect/telegram - Connect Telegram account
      if (request.method === 'POST' && url.pathname === '/connect/telegram') {
        const body: ConnectTelegramRequest = await request.json();
        
        if (!body.user_id || !body.chat_id) {
          return new Response(JSON.stringify({ error: 'Missing user_id or chat_id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        await db.createUser(body.user_id, body.chat_id);

        return new Response(JSON.stringify({ 
          message: 'Telegram account connected successfully' 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // GET /events - Get recent events
      if (request.method === 'GET' && url.pathname === '/events') {
        const repoParam = url.searchParams.get('repo');
        const kind = url.searchParams.get('kind') as 'release' | 'commit' | null;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const offset = parseInt(url.searchParams.get('offset') || '0');

        let repoId: number | undefined;
        if (repoParam) {
          const [owner, name] = repoParam.split('/');
          if (owner && name) {
            const repo = await db.getRepo(owner, name);
            repoId = repo?.id;
          }
        }

        const events = await db.getEvents(repoId, kind || undefined, limit, offset);
        
        const response = events.map(event => ({
          id: event.id,
          kind: event.kind,
          external_id: event.external_id,
          occurred_at: event.occurred_at,
          payload: JSON.parse(event.payload_json)
        }));

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // GET /health - Health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({ 
          status: 'ok',
          timestamp: Date.now()
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Telegram webhook handler (for bot commands)
      if (request.method === 'POST' && url.pathname === '/webhook/telegram') {
        const update = await request.json();
        
        // Import and use the Telegram bot handler
        const { TelegramBot } = await import('../lib/telegram-bot');
        const { TelegramAPI } = await import('../lib/telegram');
        
        const telegramAPI = new TelegramAPI(env);
        const bot = new TelegramBot(env, db, telegramAPI);
        
        await bot.handleUpdate(update);

        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (error) {
      console.error('API Error:', error);
      
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};