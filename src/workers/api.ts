import type {
  Env,
  CreateSubscriptionRequest,
  UpdateReleaseSubscriptionRequest,
  AuthResponse,
  GenerateConnectionCodeResponse
} from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';
import { AuthService } from '../lib/auth';
import { validateReleaseFilters, validateCommitFilters } from '../utils/filters';

const REPO_SEGMENT_REGEX = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_CHANNEL_IDS_PER_SUBSCRIPTION = 20;

function parsePositiveIntId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseRepoSlug(repo: unknown): { owner: string; name: string } | null {
  if (typeof repo !== 'string') {
    return null;
  }
  const parts = repo.trim().split('/');
  if (parts.length !== 2) {
    return null;
  }
  const [owner, name] = parts;
  if (
    !owner ||
    !name ||
    owner === '.' ||
    owner === '..' ||
    name === '.' ||
    name === '..' ||
    !REPO_SEGMENT_REGEX.test(owner) ||
    !REPO_SEGMENT_REGEX.test(name)
  ) {
    return null;
  }
  return { owner, name };
}

function getCorsHeaders(request: Request, env: Env, url: URL): Record<string, string> {
  let frontendOrigin = 'https://gitping.vlvt.sh';
  if (env.FRONTEND_URL) {
    try {
      frontendOrigin = new URL(env.FRONTEND_URL).origin;
    } catch {
      // Fall back to default production origin
    }
  }

  const requestOrigin = request.headers.get('Origin');
  let allowOrigin = frontendOrigin;

  if (requestOrigin) {
    if (requestOrigin === frontendOrigin) {
      allowOrigin = requestOrigin;
    } else if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)
    ) {
      allowOrigin = requestOrigin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i]! ^ bytesB[i]!;
  }
  return diff === 0;
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extraHeaders },
  });
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env, url);
    const db = new DatabaseService(env);
    const github = new GitHubAPI(env);
    const auth = new AuthService(env);

    try {
      // Strict JWT + active DB session authentication (no unauthenticated user_id fallback)
      async function authenticateUser(
        req: Request
      ): Promise<{ success: true; userId: string; sessionId: string } | { success: false; error: string }> {
        const token = auth.extractToken(req);
        if (!token) {
          return { success: false, error: 'Authentication required' };
        }

        const payload = await auth.verifyJWT(token);
        if (!payload || !payload.jti || !payload.sub) {
          return { success: false, error: 'Invalid or expired token' };
        }

        const session = await db.getSession(payload.jti);
        if (!session || session.user_id !== payload.sub) {
          return { success: false, error: 'Session not found or expired' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (now - session.last_used_at >= 300) {
          await db.updateSessionLastUsed(payload.jti);
        }

        return { success: true, userId: payload.sub, sessionId: payload.jti };
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Authentication endpoints
      // GET /auth/github - Initiate GitHub OAuth flow
      if (request.method === 'GET' && url.pathname === '/auth/github') {
        const state = auth.generateRandomString(16);
        const apiUrl = env.API_URL || `${url.protocol}//${url.host}`;
        const oauthURL = auth.getGitHubOAuthURL(state, apiUrl);

        return jsonResponse({ url: oauthURL, state }, 200, corsHeaders);
      }

      // GET /auth/callback - Handle GitHub OAuth callback
      if (request.method === 'GET' && url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const frontendUrl = env.FRONTEND_URL || 'https://gitping.vlvt.sh';

        if (!code) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${frontendUrl}/auth/login?error=${encodeURIComponent('No authorization code provided')}`,
              ...corsHeaders,
            },
          });
        }

        try {
          const accessToken = await auth.exchangeGitHubCode(code);
          if (!accessToken) throw new Error('Failed to exchange code for access token');

          const [githubUser, emails] = await Promise.all([
            auth.getGitHubUser(accessToken),
            auth.getGitHubUserEmails(accessToken),
          ]);

          if (!githubUser) throw new Error('Failed to get GitHub user info');

          const primaryEmail = emails?.find((e) => e.primary)?.email || githubUser.email;
          const user = await db.createOrUpdateGitHubUser(githubUser, primaryEmail);

          const sessionId = auth.generateRandomString();
          const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

          await db.createSession(
            sessionId,
            user.id,
            expiresAt,
            request.headers.get('User-Agent') || undefined,
            request.headers.get('CF-Connecting-IP') || undefined
          );

          const token = await auth.createJWT(user.id, sessionId);

          return new Response(null, {
            status: 302,
            headers: {
              Location: `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`,
              ...corsHeaders,
            },
          });
        } catch (error) {
          console.error('OAuth callback error:', error);
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${frontendUrl}/auth/login?error=${encodeURIComponent('Authentication failed')}`,
              ...corsHeaders,
            },
          });
        }
      }

      // POST /auth/logout - Clear session
      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        const token = auth.extractToken(request);

        if (token) {
          const payload = await auth.verifyJWT(token);
          if (payload?.jti) {
            await db.deleteSession(payload.jti);
          }
        }

        return jsonResponse({ success: true }, 200, corsHeaders, {
          'Set-Cookie': auth.createLogoutCookie(),
        });
      }

      // GET /auth/me - Get current user info
      if (request.method === 'GET' && url.pathname === '/auth/me') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ success: false, error: authResult.error }, 401, corsHeaders);
        }

        const user = await db.getUser(authResult.userId);
        if (!user) {
          return jsonResponse({ success: false, error: 'User not found' }, 404, corsHeaders);
        }

        const response: AuthResponse = { success: true, user };
        return jsonResponse(response, 200, corsHeaders);
      }

      // POST /auth/connection-code - Generate Telegram connection code
      if (request.method === 'POST' && url.pathname === '/auth/connection-code') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const code = auth.generateConnectionCode();
        const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;

        await db.createConnectionCode(code, authResult.userId, expiresAt);

        const response: GenerateConnectionCodeResponse = { code, expires_at: expiresAt };
        return jsonResponse(response, 200, corsHeaders);
      }

      // GET /channels - Get user's verified channels
      if (request.method === 'GET' && url.pathname === '/channels') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const channels = await db.getUserVerifiedChannels(authResult.userId);
        return jsonResponse(channels, 200, corsHeaders);
      }

      // DELETE /channels/:id - Remove a verified channel
      if (request.method === 'DELETE' && url.pathname.startsWith('/channels/')) {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const pathParts = url.pathname.split('/');
        const channelId = pathParts.length === 3 ? parsePositiveIntId(pathParts[2]) : null;
        if (channelId === null) {
          return jsonResponse({ error: 'Invalid channel ID' }, 400, corsHeaders);
        }

        try {
          const deleted = await db.deleteVerifiedChannel(channelId, authResult.userId);
          if (deleted) {
            return jsonResponse({ message: 'Channel removed successfully' }, 200, corsHeaders);
          }
          return jsonResponse({ error: 'Channel not found' }, 404, corsHeaders);
        } catch (error) {
          console.error('Error deleting channel:', error);
          return jsonResponse({ error: 'Failed to delete channel' }, 500, corsHeaders);
        }
      }

      // POST /subscriptions - Create a new subscription
      if (request.method === 'POST' && url.pathname === '/subscriptions') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const body = await parseJsonBody<CreateSubscriptionRequest>(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
        }

        const parsedRepo = parseRepoSlug(body.repo);
        if (!parsedRepo) {
          return jsonResponse({ error: 'Invalid repo format. Use owner/name' }, 400, corsHeaders);
        }

        if (body.kind !== 'release' && body.kind !== 'commit') {
          return jsonResponse({ error: 'Invalid subscription kind' }, 400, corsHeaders);
        }

        if (
          !Array.isArray(body.channel_ids) ||
          body.channel_ids.length === 0 ||
          body.channel_ids.length > MAX_CHANNEL_IDS_PER_SUBSCRIPTION
        ) {
          return jsonResponse(
            { error: 'channel_ids must be a non-empty array of valid channel IDs' },
            400,
            corsHeaders
          );
        }

        const uniqueChannelIds: number[] = [];
        const seenChannelIds = new Set<number>();
        for (const rawId of body.channel_ids) {
          if (typeof rawId !== 'number' || !Number.isSafeInteger(rawId) || rawId <= 0) {
            return jsonResponse(
              { error: 'channel_ids must contain only positive integers' },
              400,
              corsHeaders
            );
          }
          if (!seenChannelIds.has(rawId)) {
            seenChannelIds.add(rawId);
            uniqueChannelIds.push(rawId);
          }
        }

        let validatedFilters: object;
        try {
          validatedFilters =
            body.kind === 'release'
              ? validateReleaseFilters(body.filters || {})
              : validateCommitFilters(body.filters || {});
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : 'Invalid filters' },
            400,
            corsHeaders
          );
        }

        // Verify that every requested channel belongs to the authenticated user
        const ownedChannels = await db.getUserVerifiedChannelsByIds(
          authResult.userId,
          uniqueChannelIds
        );
        if (ownedChannels.length !== uniqueChannelIds.length) {
          return jsonResponse(
            { error: 'One or more selected channels were not found or do not belong to you' },
            403,
            corsHeaders
          );
        }

        const { owner, name } = parsedRepo;

        // Validate repo exists on GitHub
        try {
          await github.getRepository(owner, name);
        } catch {
          return jsonResponse(
            { error: 'Repository not found or not accessible' },
            404,
            corsHeaders
          );
        }

        const repoId = await db.createRepo(owner, name);
        await db.createUser(authResult.userId);

        const subscriptionId = await db.createSubscription(
          authResult.userId,
          repoId,
          body.kind,
          validatedFilters,
          []
        );

        await db.createSubscriptionChannels(subscriptionId, uniqueChannelIds);

        // Fetch latest release info for the new subscription
        let last_release = null;
        try {
          const result = await github.getReleases(owner, name);
          const releases = result.releases;

          if (releases && releases.length > 0) {
            const release = releases[0]!;
            last_release = {
              tag_name: release.tag_name,
              published_at: release.published_at,
              html_url: release.html_url,
            };
          }
        } catch (error) {
          console.log(`Failed to fetch releases for ${owner}/${name}:`, error);
        }

        const responseChannels = ownedChannels.map((ch) => ({
          type: ch.channel_type as 'telegram',
          chat_id: ch.channel_identifier,
          display_name: ch.display_name,
        }));

        const newSubscription = {
          id: subscriptionId,
          repo: `${owner}/${name}`,
          kind: body.kind,
          filters: validatedFilters,
          channels: responseChannels,
          created_at: Math.floor(Date.now() / 1000),
          last_release,
        };

        return jsonResponse(
          { ...newSubscription, message: 'Subscription created successfully' },
          201,
          corsHeaders
        );
      }

      // GET /subscriptions - Get user's subscriptions
      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const subscriptions = await db.getUserSubscriptions(authResult.userId);
        const channelsBySubscription = authResult.userId.startsWith('github_')
          ? await db.getChannelsForSubscriptions(subscriptions.map((sub) => sub.id))
          : new Map();

        const response = await Promise.all(
          subscriptions.map(async (sub) => {
            let last_release = null;

            try {
              const result = await github.getReleases(sub.owner, sub.name);
              const releases = result.releases;
              if (releases && releases.length > 0) {
                const release = releases[0]!;
                last_release = {
                  tag_name: release.tag_name,
                  published_at: release.published_at,
                  html_url: release.html_url,
                };
              }
            } catch (error) {
              console.log(`Failed to fetch releases for ${sub.owner}/${sub.name}:`, error);
            }

            let channels = JSON.parse(sub.channels_json);
            if (authResult.userId.startsWith('github_')) {
              const verifiedChannels = channelsBySubscription.get(sub.id) || [];
              channels = verifiedChannels.map((ch: any) => ({
                type: ch.channel_type,
                chat_id: ch.channel_identifier,
                display_name: ch.display_name,
              }));
            }

            return {
              id: sub.id,
              repo: `${sub.owner}/${sub.name}`,
              kind: sub.kind,
              filters: JSON.parse(sub.filters_json),
              channels,
              created_at: sub.created_at,
              last_release,
            };
          })
        );

        return jsonResponse(response, 200, corsHeaders);
      }

      // PATCH /subscriptions/:id - Update a release subscription's filters
      if (request.method === 'PATCH' && url.pathname.startsWith('/subscriptions/')) {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const pathParts = url.pathname.split('/');
        const subscriptionId = pathParts.length === 3 ? parsePositiveIntId(pathParts[2]) : null;
        if (subscriptionId === null) {
          return jsonResponse({ error: 'Invalid subscription ID' }, 400, corsHeaders);
        }

        const body = await parseJsonBody<UpdateReleaseSubscriptionRequest>(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
        }

        let filters;
        try {
          filters = validateReleaseFilters(body.filters || {});
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : 'Invalid release filters' },
            400,
            corsHeaders
          );
        }

        const updated = await db.updateReleaseSubscriptionFilters(
          subscriptionId,
          authResult.userId,
          filters
        );

        if (!updated) {
          return jsonResponse(
            { error: 'Release subscription not found or you do not have permission to update it' },
            404,
            corsHeaders
          );
        }

        return jsonResponse(
          { id: subscriptionId, filters, message: 'Subscription filters updated' },
          200,
          corsHeaders
        );
      }

      // DELETE /subscriptions/:id - Delete a subscription
      if (request.method === 'DELETE' && url.pathname.startsWith('/subscriptions/')) {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const pathParts = url.pathname.split('/');
        const subscriptionId = pathParts.length === 3 ? parsePositiveIntId(pathParts[2]) : null;
        if (subscriptionId === null) {
          return jsonResponse({ error: 'Invalid subscription ID' }, 400, corsHeaders);
        }

        try {
          const deleted = await db.deleteSubscription(subscriptionId, authResult.userId);
          if (deleted) {
            return jsonResponse({ message: 'Subscription deleted' }, 200, corsHeaders);
          }
          return jsonResponse(
            { error: 'Subscription not found or you do not have permission to delete it' },
            404,
            corsHeaders
          );
        } catch (deleteError) {
          console.error('Error in DELETE /subscriptions:', deleteError);
          return jsonResponse({ error: 'Failed to delete subscription' }, 500, corsHeaders);
        }
      }

      // GET /events - Get recent events (authenticated)
      if (request.method === 'GET' && url.pathname === '/events') {
        const authResult = await authenticateUser(request);
        if (!authResult.success) {
          return jsonResponse({ error: authResult.error }, 401, corsHeaders);
        }

        const repoParam = url.searchParams.get('repo');
        const kindParam = url.searchParams.get('kind');
        if (kindParam && kindParam !== 'release' && kindParam !== 'commit') {
          return jsonResponse({ error: 'Invalid event kind' }, 400, corsHeaders);
        }
        const kind = (kindParam as 'release' | 'commit' | null) || undefined;

        const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const rawOffset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = Number.isNaN(rawLimit) ? 50 : Math.max(1, Math.min(rawLimit, 50));
        const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset);

        let repoId: number | undefined;
        if (repoParam) {
          const parsedRepo = parseRepoSlug(repoParam);
          if (!parsedRepo) {
            return jsonResponse({ error: 'Invalid repo format. Use owner/name' }, 400, corsHeaders);
          }
          const repo = await db.getRepo(parsedRepo.owner, parsedRepo.name);
          if (!repo) {
            return jsonResponse([], 200, corsHeaders);
          }
          repoId = repo.id;
        }

        const events = await db.getEvents(repoId, kind, limit, offset);
        const response = events.map((event) => ({
          id: event.id,
          kind: event.kind,
          external_id: event.external_id,
          occurred_at: event.occurred_at,
          payload: JSON.parse(event.payload_json),
        }));

        return jsonResponse(response, 200, corsHeaders);
      }

      // GET /health - Health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() }, 200, corsHeaders);
      }

      // Telegram webhook handler (for bot commands)
      if (request.method === 'POST' && url.pathname === '/webhook/telegram') {
        if (!env.TELEGRAM_WEBHOOK_SECRET) {
          console.error('TELEGRAM_WEBHOOK_SECRET is not configured');
          return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const providedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (!providedSecret || !(await timingSafeEqual(providedSecret, env.TELEGRAM_WEBHOOK_SECRET))) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        try {
          const update = await parseJsonBody<any>(request);
          if (!update) {
            return new Response(JSON.stringify({ error: 'Invalid update payload' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const { TelegramBot } = await import('../lib/telegram-bot');
          const { TelegramAPI } = await import('../lib/telegram');

          const telegramAPI = new TelegramAPI(env);
          const bot = new TelegramBot(env, db, telegramAPI);

          await bot.handleUpdate(update);

          return new Response(JSON.stringify({ status: 'ok' }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Webhook error:', error);
          return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('API Error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
    }
  },
};
