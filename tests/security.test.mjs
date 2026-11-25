import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const repoRoot = path.resolve(import.meta.dirname, '..');
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitping-test-'));

// Build the exact Wrangler Worker bundles for API and Poller
execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', path.join(buildDir, 'api'), '--config', 'wrangler-api.toml'], {
  cwd: repoRoot,
  stdio: 'pipe',
});
execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', path.join(buildDir, 'poller'), '--config', 'wrangler-poller.toml'], {
  cwd: repoRoot,
  stdio: 'pipe',
});

const { default: apiWorker } = await import(path.join(buildDir, 'api', 'api.js'));
const { default: pollerWorker } = await import(path.join(buildDir, 'poller', 'simple-poller.js'));

const schemaSql = fs.readFileSync(path.join(repoRoot, 'src', 'schema.sql'), 'utf8');

class MockD1PreparedStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new MockD1PreparedStatement(this.db, this.sql, params);
  }

  async first() {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params);
    return row ?? null;
  }

  async all() {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.params);
    return { results, success: true, meta: {} };
  }

  async run() {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

class MockD1Database {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.sqlite.exec(schemaSql);
  }

  prepare(sql) {
    return new MockD1PreparedStatement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function signJwt(userId, sessionId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: userId, exp: now + 3600, iat: now, jti: sessionId }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

function createFixture() {
  const db = new MockD1Database();
  const env = {
    DB: db,
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
    GITHUB_TOKEN: 'ghp_test',
    GITHUB_CLIENT_ID: 'client_id',
    GITHUB_CLIENT_SECRET: 'client_secret',
    TELEGRAM_BOT_TOKEN: '123456:TEST_BOT_TOKEN',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret-token',
    FRONTEND_URL: 'https://gitping.vlvt.sh',
  };

  const now = Math.floor(Date.now() / 1000);
  // Seed User A and User B, sessions, channels, repo, subscription, event, notification
  db.sqlite.prepare("INSERT INTO users (id, github_id, github_username, email) VALUES (?, ?, ?, ?)").run('github_1', '1', 'alice', 'alice@example.com');
  db.sqlite.prepare("INSERT INTO users (id, github_id, github_username, email) VALUES (?, ?, ?, ?)").run('github_2', '2', 'bob', 'bob@example.com');
  db.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at, last_used_at) VALUES (?, ?, ?, ?)").run('sess_alice', 'github_1', now + 3600, now);
  db.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at, last_used_at) VALUES (?, ?, ?, ?)").run('sess_bob', 'github_2', now + 3600, now);

  const chA = db.sqlite.prepare("INSERT INTO verified_channels (user_id, channel_type, channel_identifier, display_name, verified_at) VALUES (?, 'telegram', ?, 'Alice TG', ?)").run('github_1', '111111', now);
  const chB = db.sqlite.prepare("INSERT INTO verified_channels (user_id, channel_type, channel_identifier, display_name, verified_at) VALUES (?, 'telegram', ?, 'Bob TG', ?)").run('github_2', '222222', now);

  const repo = db.sqlite.prepare("INSERT INTO repos (owner, name) VALUES ('vercel', 'next.js')").run();
  const subA = db.sqlite.prepare("INSERT INTO subscriptions (user_id, repo_id, kind, filters_json, channels_json) VALUES ('github_1', ?, 'release', '{}', '[]')").run(Number(repo.lastInsertRowid));
  db.sqlite.prepare("INSERT INTO subscription_channels (subscription_id, channel_id) VALUES (?, ?)").run(Number(subA.lastInsertRowid), Number(chA.lastInsertRowid));
  const ev = db.sqlite.prepare("INSERT INTO events (repo_id, kind, external_id, payload_json, occurred_at) VALUES (?, 'release', 'rel-1', '{\"tag_name\":\"v1.0.0\"}', ?)").run(Number(repo.lastInsertRowid), now);
  db.sqlite.prepare("INSERT INTO notifications (event_id, subscription_id, channel, status) VALUES (?, ?, 'telegram', 'sent')").run(Number(ev.lastInsertRowid), Number(subA.lastInsertRowid));

  return {
    db,
    env,
    channelA: Number(chA.lastInsertRowid),
    channelB: Number(chB.lastInsertRowid),
    subA: Number(subA.lastInsertRowid),
    repoId: Number(repo.lastInsertRowid),
  };
}

// Mock global fetch for GitHub + Telegram calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const s = String(url);
  if (s.includes('api.github.com/repos/') && s.endsWith('/releases?per_page=10')) {
    return new Response(JSON.stringify([
      {
        id: 999001,
        tag_name: 'v2.0.0',
        name: 'Release 2.0.0',
        body: 'x'.repeat(5000),
        html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
        published_at: '2026-11-25T12:00:00Z',
        prerelease: false,
        draft: false,
        assets: [{ id: 1, name: 'huge.tar.gz', extra: 'y'.repeat(10000) }],
        author: { login: 'maintainer', bio: 'z'.repeat(5000) },
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (s.includes('api.github.com/repos/')) {
    return new Response(JSON.stringify({ id: 1, full_name: 'owner/repo' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (s.includes('api.telegram.org/bot')) {
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return originalFetch(url);
};

test.after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(buildDir, { recursive: true, force: true });
});

test('blocks unauthenticated user_id bypass and removed/protected endpoints', async () => {
  const { env, subA } = createFixture();

  const r1 = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: 'attacker',
      repo: 'vercel/next.js',
      kind: 'release',
      channel_ids: ['(SELECT CASE WHEN 1=1 THEN 1 ELSE NULL END)'],
    }),
  }), env);
  assert.equal(r1.status, 401);

  const r2 = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions?user_id=github_1'), env);
  assert.equal(r2.status, 401);

  const r3 = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh/subscriptions/${subA}?user_id=github_1`, {
    method: 'DELETE',
  }), env);
  assert.equal(r3.status, 401);

  const r4 = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/connect/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'attacker', chat_id: '999' }),
  }), env);
  assert.equal(r4.status, 404);

  const r5 = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/events'), env);
  assert.equal(r5.status, 401);
});

test('blocks SQLi payload and non-integer channel_ids even with valid JWT', async () => {
  const { db, env } = createFixture();
  const token = await signJwt('github_1', 'sess_alice', env.JWT_SECRET);

  const sqliPayload = [
    '(SELECT CASE WHEN ((((SELECT COUNT(*) FROM users) / 1) % 2) = 1) THEN (SELECT id FROM verified_channels ORDER BY id LIMIT 1 OFFSET 0) ELSE NULL END)',
  ];

  for (const badBody of [
    { repo: 'vercel/next.js', kind: 'release', channel_ids: sqliPayload },
    { repo: 'vercel/next.js', kind: 'release', channel_ids: ['1'] },
    { repo: 'vercel/next.js', kind: 'release', channel_ids: [1.5] },
    { repo: 'vercel/next.js', kind: 'release', channel_ids: [-1] },
    { repo: 'vercel/next.js', kind: 'release', channel_ids: [] },
    { repo: 'vercel/next.js', kind: 'release', channels: [{ type: 'telegram', chat_id: '222222' }] },
  ]) {
    const res = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(badBody),
    }), env);
    assert.equal(res.status, 400, `Expected 400 for body ${JSON.stringify(badBody)}, got ${res.status}`);
  }

  const count = db.sqlite.prepare('SELECT COUNT(*) as c FROM subscriptions').get().c;
  assert.equal(count, 1);
});

test('blocks cross-user channel ownership abuse and IDOR deletes', async () => {
  const { db, env, channelA, channelB, subA } = createFixture();
  const aliceToken = await signJwt('github_1', 'sess_alice', env.JWT_SECRET);
  const bobToken = await signJwt('github_2', 'sess_bob', env.JWT_SECRET);

  // Alice tries to subscribe using Bob's verified channel
  const rCross = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({ repo: 'facebook/react', kind: 'release', channel_ids: [channelB] }),
  }), env);
  assert.equal(rCross.status, 403);

  // Bob tries to delete Alice's subscription (previously wiped Alice's notifications + subscription_channels!)
  const rDelSub = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh/subscriptions/${subA}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bobToken}` },
  }), env);
  assert.equal(rDelSub.status, 404);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) as c FROM notifications WHERE subscription_id = ?').get(subA).c, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) as c FROM subscription_channels WHERE subscription_id = ?').get(subA).c, 1);

  // Bob tries to delete Alice's channel (previously detached Alice's channel from all subscriptions!)
  const rDelCh = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh/channels/${channelA}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bobToken}` },
  }), env);
  assert.equal(rDelCh.status, 404);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) as c FROM subscription_channels WHERE channel_id = ?').get(channelA).c, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) as c FROM verified_channels WHERE id = ?').get(channelA).c, 1);
});

test('enforces active session after logout across all authenticated endpoints', async () => {
  const { env, channelA } = createFixture();
  const aliceToken = await signJwt('github_1', 'sess_alice', env.JWT_SECRET);

  const logout = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
  }), env);
  assert.equal(logout.status, 200);

  for (const [method, endpoint] of [
    ['GET', '/auth/me'],
    ['POST', '/auth/connection-code'],
    ['GET', '/channels'],
    ['DELETE', `/channels/${channelA}`],
    ['GET', '/subscriptions'],
    ['GET', '/events'],
  ]) {
    const res = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${aliceToken}` },
    }), env);
    assert.equal(res.status, 401, `Expected 401 after logout for ${method} ${endpoint}, got ${res.status}`);
  }
});

test('blocks repo path traversal and validates Telegram webhook secret', async () => {
  const { env, channelA } = createFixture();
  const aliceToken = await signJwt('github_1', 'sess_alice', env.JWT_SECRET);

  for (const badRepo of ['../evil', 'a/b/../../orgs/x', 'owner/..', 'owner/name?foo=bar']) {
    const res = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ repo: badRepo, kind: 'release', channel_ids: [channelA] }),
    }), env);
    assert.equal(res.status, 400);
  }

  // Webhook unconfigured -> 503
  const rUnconfigured = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/webhook/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: 1 }),
  }), { ...env, TELEGRAM_WEBHOOK_SECRET: undefined });
  assert.equal(rUnconfigured.status, 503);

  // Webhook missing or wrong secret -> 401
  const rNoSecret = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/webhook/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: 1 }),
  }), env);
  assert.equal(rNoSecret.status, 401);

  const rWrongSecret = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/webhook/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
    },
    body: JSON.stringify({ update_id: 1 }),
  }), env);
  assert.equal(rWrongSecret.status, 401);

  // Webhook valid secret -> 200
  const rOk = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/webhook/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ update_id: 1 }),
  }), env);
  assert.equal(rOk.status, 200);
});

test('legitimate CRUD flow works and SQLite uses new indexes without full scans', async () => {
  const { db, env, channelA } = createFixture();
  const aliceToken = await signJwt('github_1', 'sess_alice', env.JWT_SECRET);

  // Verify CORS does not echo arbitrary origins
  const rEvilCors = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/health', {
    headers: { Origin: 'https://evil.example' },
  }), env);
  assert.equal(rEvilCors.headers.get('Access-Control-Allow-Origin'), 'https://gitping.vlvt.sh');
  assert.equal(rEvilCors.headers.get('Access-Control-Allow-Credentials'), null);

  // Create subscription
  const rCreate = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      repo: 'facebook/react',
      kind: 'release',
      filters: { include_prereleases: false },
      channel_ids: [channelA],
    }),
  }), env);
  assert.equal(rCreate.status, 201);
  const created = await rCreate.json();
  assert.equal(created.repo, 'facebook/react');
  assert.equal(created.channels.length, 1);

  // List subscriptions
  const rList = await apiWorker.fetch(new Request('https://gitping-api.vlvt.sh/subscriptions', {
    headers: { Authorization: `Bearer ${aliceToken}` },
  }), env);
  assert.equal(rList.status, 200);
  const list = await rList.json();
  assert.equal(list.length, 2);

  // PATCH filters
  const rPatch = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh/subscriptions/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({ filters: { include_prereleases: true } }),
  }), env);
  assert.equal(rPatch.status, 200);

  // DELETE subscription
  const rDel = await apiWorker.fetch(new Request(`https://gitping-api.vlvt.sh/subscriptions/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${aliceToken}` },
  }), env);
  assert.equal(rDel.status, 200);

  // Verify EXPLAIN QUERY PLAN uses the new indexes
  const notifPlan = db.sqlite
    .prepare('EXPLAIN QUERY PLAN DELETE FROM notifications WHERE subscription_id = ?')
    .all(1)
    .map((r) => r.detail)
    .join(' | ');
  assert.match(notifPlan, /idx_notifications_subscription/);

  const eventsPlan = db.sqlite
    .prepare('EXPLAIN QUERY PLAN SELECT e.*, r.owner, r.name FROM events e JOIN repos r ON r.id = e.repo_id ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?')
    .all(50, 0)
    .map((r) => r.detail)
    .join(' | ');
  assert.match(eventsPlan, /idx_events_occurred_at/);
});

test('poller stores compact release payload instead of full GitHub API JSON', async () => {
  const { db, env, repoId } = createFixture();
  // Seed prior poll state so v2.0.0 (id 999001) is treated as a new release
  db.sqlite.prepare("INSERT INTO repo_poll_states (repo_id, release_last_seen_id, updated_at) VALUES (?, '100', ?)").run(repoId, Date.now());

  // Compute scheduledTime whose UTC minute matches repoId % 60
  const scheduledDate = new Date(Date.UTC(2026, 10, 25, 14, repoId % 60, 0));
  await pollerWorker.scheduled({ scheduledTime: scheduledDate.getTime() }, env, {});

  const stored = db.sqlite.prepare("SELECT payload_json FROM events WHERE external_id = '999001'").get();
  assert.ok(stored, 'Expected poller to insert release event 999001');
  const parsed = JSON.parse(stored.payload_json);
  assert.equal(parsed.tag_name, 'v2.0.0');
  assert.equal(parsed.body.length, 1000);
  assert.equal(parsed.assets, undefined);
  assert.equal(parsed.author, undefined);
  assert.ok(stored.payload_json.length < 1500, `Expected compact payload, got ${stored.payload_json.length} bytes`);
});
