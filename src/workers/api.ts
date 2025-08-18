import type { Env, CreateSubscriptionRequest, ConnectTelegramRequest } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const db = new DatabaseService(env);
    const github = new GitHubAPI(env);

    try {
      // CORS headers for web clients
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // POST /subscriptions - Create a new subscription
      if (request.method === 'POST' && url.pathname === '/subscriptions') {
        const body: CreateSubscriptionRequest = await request.json();
        
        // Validate input
        if (!body.user_id || !body.repo || !body.kind || !body.channels?.length) {
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
        await db.createUser(body.user_id);
        
        // Create subscription
        const subscriptionId = await db.createSubscription(
          body.user_id,
          repoId,
          body.kind,
          body.filters || {},
          body.channels
        );

        return new Response(JSON.stringify({ 
          id: subscriptionId,
          message: 'Subscription created successfully' 
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // GET /subscriptions?user_id=xxx - Get user's subscriptions
      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return new Response(JSON.stringify({ error: 'user_id parameter required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const subscriptions = await db.getUserSubscriptions(userId);
        
        const response = subscriptions.map(sub => ({
          id: sub.id,
          repo: `${sub.owner}/${sub.name}`,
          kind: sub.kind,
          filters: JSON.parse(sub.filters_json),
          channels: JSON.parse(sub.channels_json),
          created_at: sub.created_at
        }));

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // DELETE /subscriptions/:id - Delete a subscription
      if (request.method === 'DELETE' && url.pathname.startsWith('/subscriptions/')) {
        const subscriptionId = parseInt(url.pathname.split('/')[2]);
        const userId = url.searchParams.get('user_id');

        if (!userId || isNaN(subscriptionId)) {
          return new Response(JSON.stringify({ error: 'Invalid subscription ID or missing user_id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const deleted = await db.deleteSubscription(subscriptionId, userId);
        
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