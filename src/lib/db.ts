import type {
  Env,
  Repo,
  PollingRepo,
  PollState,
  Subscription,
  Event,
  User,
  Session,
  ConnectionCode,
  VerifiedChannel
} from './types';

let repoPollStateSchemaReady = false;

export class DatabaseService {
  constructor(private env: Env) {}

  private async ensureRepoPollStateSchema(): Promise<void> {
    if (repoPollStateSchemaReady) {
      return;
    }

    await this.env.DB
      .prepare(`
        CREATE TABLE IF NOT EXISTS repo_poll_states (
          repo_id INTEGER PRIMARY KEY,
          release_last_seen_id TEXT,
          release_etag TEXT,
          release_last_modified TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
        )
      `)
      .run();

    await this.env.DB
      .prepare('CREATE INDEX IF NOT EXISTS idx_repo_poll_states_updated ON repo_poll_states(updated_at)')
      .run();

    repoPollStateSchemaReady = true;
  }

  // Users
  async createUser(id: string, tgChatId?: string): Promise<void> {
    // Only create user if they don't exist (don't overwrite existing users)
    await this.env.DB
      .prepare('INSERT OR IGNORE INTO users (id, tg_chat_id) VALUES (?, ?)')
      .bind(id, tgChatId || null)
      .run();
  }

  async getUser(id: string): Promise<User | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first();
    
    return result as User | null;
  }

  // GitHub OAuth user management
  async createOrUpdateGitHubUser(githubUser: any, email?: string): Promise<User> {
    const userId = `github_${githubUser.id}`;
    
    // First try to insert the user if they don't exist
    await this.env.DB
      .prepare(`
        INSERT OR IGNORE INTO users (
          id, github_id, github_username, name, email, avatar_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))
      `)
      .bind(
        userId,
        githubUser.id.toString(),
        githubUser.login,
        githubUser.name || githubUser.login,
        email || githubUser.email,
        githubUser.avatar_url
      )
      .run();

    // Then update the user with latest GitHub info (preserving verified channels)
    await this.env.DB
      .prepare(`
        UPDATE users 
        SET github_id = ?, github_username = ?, name = ?, email = ?, avatar_url = ?
        WHERE id = ?
      `)
      .bind(
        githubUser.id.toString(),
        githubUser.login,
        githubUser.name || githubUser.login,
        email || githubUser.email,
        githubUser.avatar_url,
        userId
      )
      .run();

    return await this.getUser(userId) as User;
  }

  async getUserByGitHubId(githubId: string): Promise<User | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM users WHERE github_id = ?')
      .bind(githubId)
      .first();
    
    return result as User | null;
  }

  // Repositories
  async createRepo(owner: string, name: string, defaultBranch = 'main'): Promise<number> {
    const result = await this.env.DB
      .prepare('INSERT OR IGNORE INTO repos (owner, name, default_branch) VALUES (?, ?, ?)')
      .bind(owner, name, defaultBranch)
      .run();

    if (result.meta.changes === 0) {
      // Repo already exists, get its ID
      const existing = await this.env.DB
        .prepare('SELECT id FROM repos WHERE owner = ? AND name = ?')
        .bind(owner, name)
        .first<{ id: number }>();
      
      return existing!.id;
    }

    return result.meta.last_row_id as number;
  }

  async getRepo(owner: string, name: string): Promise<Repo | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM repos WHERE owner = ? AND name = ?')
      .bind(owner, name)
      .first();
    
    return result as Repo | null;
  }

  async getRepoById(id: number): Promise<Repo | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM repos WHERE id = ?')
      .bind(id)
      .first();
    
    return result as Repo | null;
  }

  async getReposForPolling(minute: number): Promise<PollingRepo[]> {
    await this.ensureRepoPollStateSchema();

    const result = await this.env.DB
      .prepare(`
        SELECT
          r.*,
          ps.release_last_seen_id,
          ps.release_etag,
          ps.release_last_modified
        FROM repos r
        LEFT JOIN repo_poll_states ps ON ps.repo_id = r.id
        WHERE r.id % 60 = ?
        AND EXISTS (
          SELECT 1
          FROM subscriptions s
          WHERE s.repo_id = r.id
          LIMIT 1
        )
        AND (
          r.consecutive_errors < 5
          OR r.last_polled_at IS NULL
          OR r.last_polled_at < ?
        )
        ORDER BY r.last_polled_at ASC NULLS FIRST
        LIMIT 100
      `)
      .bind(minute, Date.now() - 300000) // 5 minutes ago
      .all();
    
    return (result.results || []) as unknown as PollingRepo[];
  }

  async updateRepoPollingState(
    id: number, 
    consecutiveErrors: number, 
    lastPolledAt?: number
  ): Promise<void> {
    await this.env.DB
      .prepare(`
        UPDATE repos 
        SET consecutive_errors = ?, last_polled_at = ?
        WHERE id = ?
      `)
      .bind(consecutiveErrors, lastPolledAt || Date.now(), id)
      .run();
  }

  async updateRepoReleasePollState(repoId: number, state: PollState): Promise<void> {
    await this.ensureRepoPollStateSchema();

    await this.env.DB
      .prepare(`
        INSERT INTO repo_poll_states (
          repo_id,
          release_last_seen_id,
          release_etag,
          release_last_modified,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(repo_id) DO UPDATE SET
          release_last_seen_id = excluded.release_last_seen_id,
          release_etag = excluded.release_etag,
          release_last_modified = excluded.release_last_modified,
          updated_at = excluded.updated_at
      `)
      .bind(
        repoId,
        state.lastSeenId || null,
        state.etag || null,
        state.lastModified || null,
        Date.now()
      )
      .run();
  }

  // Subscriptions
  async createSubscription(
    userId: string,
    repoId: number,
    kind: 'release' | 'commit',
    filters: object,
    channels: object[]
  ): Promise<number> {
    const result = await this.env.DB
      .prepare(`
        INSERT INTO subscriptions (user_id, repo_id, kind, filters_json, channels_json)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        repoId,
        kind,
        JSON.stringify(filters),
        JSON.stringify(channels)
      )
      .run();

    return result.meta.last_row_id as number;
  }

  async getSubscriptionsForRepo(repoId: number, kind: 'release' | 'commit'): Promise<Subscription[]> {
    const result = await this.env.DB
      .prepare(`
        SELECT * FROM subscriptions 
        WHERE repo_id = ? AND kind = ?
      `)
      .bind(repoId, kind)
      .all();
    
    return (result.results || []) as Subscription[];
  }

  async getUserSubscriptions(userId: string): Promise<Array<Subscription & Repo>> {
    const result = await this.env.DB
      .prepare(`
        SELECT s.*, r.owner, r.name, r.default_branch
        FROM subscriptions s
        JOIN repos r ON r.id = s.repo_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
      `)
      .bind(userId)
      .all();
    
    return (result.results || []) as Array<Subscription & Repo>;
  }

  async updateReleaseSubscriptionFilters(
    id: number,
    userId: string,
    filters: object
  ): Promise<boolean> {
    const result = await this.env.DB
      .prepare(`
        UPDATE subscriptions
        SET filters_json = ?
        WHERE id = ? AND user_id = ? AND kind = 'release'
      `)
      .bind(JSON.stringify(filters), id, userId)
      .run();

    return result.meta.changes > 0;
  }

  async deleteSubscription(id: number, userId: string): Promise<boolean> {
    try {
      // Verify ownership before touching child records to prevent IDOR
      const existing = await this.env.DB
        .prepare('SELECT id FROM subscriptions WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first<{ id: number }>();

      if (!existing) {
        return false;
      }

      const results = await this.env.DB.batch([
        this.env.DB
          .prepare('DELETE FROM notifications WHERE subscription_id = ?')
          .bind(id),
        this.env.DB
          .prepare('DELETE FROM subscription_channels WHERE subscription_id = ?')
          .bind(id),
        this.env.DB
          .prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?')
          .bind(id, userId)
      ]);

      return (results[2]?.meta?.changes ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting subscription:', error);
      throw error;
    }
  }

  // Events
  async createEvent(
    repoId: number,
    kind: 'release' | 'commit',
    externalId: string,
    payload: object,
    occurredAt: number
  ): Promise<number | null> {
    try {
      const result = await this.env.DB
        .prepare(`
          INSERT INTO events (repo_id, kind, external_id, payload_json, occurred_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(repoId, kind, externalId, JSON.stringify(payload), occurredAt)
        .run();

      return result.meta.last_row_id as number;
    } catch (error) {
      // Handle unique constraint violation (duplicate event)
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return null; // Event already exists
      }
      throw error;
    }
  }

  async getEvents(
    repoId?: number,
    kind?: 'release' | 'commit',
    limit = 50,
    offset = 0
  ): Promise<Event[]> {
    let query = `
      SELECT e.*, r.owner, r.name
      FROM events e
      JOIN repos r ON r.id = e.repo_id
    `;
    const params: (string | number)[] = [];

    const conditions: string[] = [];
    if (repoId) {
      conditions.push('e.repo_id = ?');
      params.push(repoId);
    }
    if (kind) {
      conditions.push('e.kind = ?');
      params.push(kind);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await this.env.DB
      .prepare(query)
      .bind(...params)
      .all();
    
    return (result.results || []) as Event[];
  }

  // Notifications
  async createNotification(
    eventId: number,
    subscriptionId: number,
    channel: string
  ): Promise<number> {
    const result = await this.env.DB
      .prepare(`
        INSERT INTO notifications (event_id, subscription_id, channel)
        VALUES (?, ?, ?)
      `)
      .bind(eventId, subscriptionId, channel)
      .run();

    return result.meta.last_row_id as number;
  }

  async updateNotificationStatus(
    id: number,
    status: 'sent' | 'error',
    error?: string
  ): Promise<void> {
    const now = Date.now();
    
    await this.env.DB
      .prepare(`
        UPDATE notifications 
        SET status = ?, attempts = attempts + 1, last_error = ?, 
            last_error_at = CASE WHEN ? = 'error' THEN ? ELSE last_error_at END,
            sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
        WHERE id = ?
      `)
      .bind(status, error || null, status, now, status, now, id)
      .run();
  }

  async getFailedNotifications(maxAttempts = 3): Promise<any[]> {
    const result = await this.env.DB
      .prepare(`
        SELECT n.*, e.payload_json, e.kind, r.owner, r.name, s.channels_json
        FROM notifications n
        JOIN events e ON e.id = n.event_id
        JOIN repos r ON r.id = e.repo_id  
        JOIN subscriptions s ON s.id = n.subscription_id
        WHERE n.status = 'error' AND n.attempts < ?
        AND (n.last_error_at IS NULL OR n.last_error_at < ?)
        ORDER BY n.last_error_at ASC NULLS FIRST
        LIMIT 50
      `)
      .bind(maxAttempts, Date.now() - 300000) // 5 minutes ago
      .all();
    
    return result.results || [];
  }

  // Session management
  async createSession(sessionId: string, userId: string, expiresAt: number, userAgent?: string, ipAddress?: string): Promise<void> {
    await this.env.DB
      .prepare(`
        INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(sessionId, userId, expiresAt, userAgent || null, ipAddress || null)
      .run();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sessionId, Math.floor(Date.now() / 1000))
      .first();
    
    return result as Session | null;
  }

  async updateSessionLastUsed(sessionId: string): Promise<void> {
    await this.env.DB
      .prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), sessionId)
      .run();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.env.DB
      .prepare('DELETE FROM sessions WHERE id = ?')
      .bind(sessionId)
      .run();
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.env.DB
      .prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(userId)
      .run();
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.env.DB
      .prepare('DELETE FROM sessions WHERE expires_at < ?')
      .bind(now)
      .run();
  }

  // Connection codes for Telegram linking
  async createConnectionCode(code: string, userId: string, expiresAt: number): Promise<void> {
    await this.env.DB
      .prepare(`
        INSERT OR REPLACE INTO connection_codes (code, user_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .bind(code, userId, expiresAt)
      .run();
  }

  async getConnectionCode(code: string): Promise<ConnectionCode | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM connection_codes WHERE code = ? AND expires_at > ? AND used_at IS NULL')
      .bind(code, Math.floor(Date.now() / 1000))
      .first();
    
    return result as ConnectionCode | null;
  }

  async useConnectionCode(code: string, tgChatId: string, telegramUserId?: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    
    // First check if code exists and is valid
    const connectionCode = await this.getConnectionCode(code);
    if (!connectionCode) {
      console.log(`Connection code ${code} not found or expired`);
      return false;
    }

    console.log(`Using connection code ${code} for GitHub user ${connectionCode.user_id}, linking to Telegram chat ${tgChatId}`);

    // Use the code and link Telegram
    await this.env.DB
      .prepare(`
        UPDATE connection_codes 
        SET used_at = ?, tg_chat_id = ? 
        WHERE code = ?
      `)
      .bind(now, tgChatId, code)
      .run();

    // Create verified channel for the GitHub user
    await this.createVerifiedChannel(
      connectionCode.user_id,
      'telegram',
      tgChatId,
      'Telegram'
    );

    // Link Telegram user to GitHub account (if telegramUserId provided)
    if (telegramUserId) {
      await this.linkTelegramUser(telegramUserId, connectionCode.user_id);
      console.log(`Linked Telegram user ${telegramUserId} to GitHub user ${connectionCode.user_id}`);
    }

    console.log(`Created verified Telegram channel for GitHub user ${connectionCode.user_id} with chat ID ${tgChatId}`);

    return true;
  }

  async cleanupExpiredConnectionCodes(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.env.DB
      .prepare('DELETE FROM connection_codes WHERE expires_at < ?')
      .bind(now)
      .run();
  }

  // Verified Channels
  async createVerifiedChannel(
    userId: string, 
    channelType: string, 
    channelIdentifier: string, 
    displayName?: string
  ): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    
    const result = await this.env.DB
      .prepare(`
        INSERT OR REPLACE INTO verified_channels 
        (user_id, channel_type, channel_identifier, display_name, verified_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(userId, channelType, channelIdentifier, displayName || null, now)
      .run();

    return result.meta.last_row_id as number;
  }

  async getUserVerifiedChannels(userId: string): Promise<VerifiedChannel[]> {
    const result = await this.env.DB
      .prepare('SELECT * FROM verified_channels WHERE user_id = ? ORDER BY created_at ASC')
      .bind(userId)
      .all();
    
    return result.results as VerifiedChannel[] || [];
  }

  async getVerifiedChannel(channelId: number): Promise<VerifiedChannel | null> {
    const result = await this.env.DB
      .prepare('SELECT * FROM verified_channels WHERE id = ?')
      .bind(channelId)
      .first();
    
    return result as VerifiedChannel | null;
  }

  async getUserVerifiedChannelsByIds(userId: string, channelIds: number[]): Promise<VerifiedChannel[]> {
    const uniqueChannelIds = Array.from(new Set(channelIds));
    if (uniqueChannelIds.length === 0) {
      return [];
    }

    for (const channelId of uniqueChannelIds) {
      if (!Number.isSafeInteger(channelId) || channelId <= 0) {
        throw new Error('Invalid channel ID');
      }
    }

    const channels: VerifiedChannel[] = [];
    const chunkSize = 90;
    for (let i = 0; i < uniqueChannelIds.length; i += chunkSize) {
      const chunk = uniqueChannelIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await this.env.DB
        .prepare(`SELECT * FROM verified_channels WHERE user_id = ? AND id IN (${placeholders}) ORDER BY created_at ASC`)
        .bind(userId, ...chunk)
        .all();

      channels.push(...((result.results || []) as unknown as VerifiedChannel[]));
    }

    return channels;
  }

  async deleteVerifiedChannel(channelId: number, userId: string): Promise<boolean> {
    // Verify ownership before removing links from subscription_channels
    const existingChannel = await this.env.DB
      .prepare('SELECT id FROM verified_channels WHERE id = ? AND user_id = ?')
      .bind(channelId, userId)
      .first<{ id: number }>();

    if (!existingChannel) {
      return false;
    }

    const results = await this.env.DB.batch([
      this.env.DB
        .prepare('DELETE FROM subscription_channels WHERE channel_id = ?')
        .bind(channelId),
      this.env.DB
        .prepare('DELETE FROM verified_channels WHERE id = ? AND user_id = ?')
        .bind(channelId, userId)
    ]);

    return (results[1]?.meta?.changes ?? 0) > 0;
  }

  // Subscription Channels (many-to-many relationship)
  async createSubscriptionChannels(subscriptionId: number, channelIds: number[]): Promise<void> {
    if (!Number.isSafeInteger(subscriptionId) || subscriptionId <= 0) {
      throw new Error('Invalid subscription ID');
    }

    const uniqueChannelIds = Array.from(new Set(channelIds));
    if (uniqueChannelIds.length === 0) return;

    for (const channelId of uniqueChannelIds) {
      if (!Number.isSafeInteger(channelId) || channelId <= 0) {
        throw new Error('Invalid channel ID');
      }
    }

    const chunkSize = 40; // 80 bind parameters max per statement (D1 limit is 100)
    for (let i = 0; i < uniqueChannelIds.length; i += chunkSize) {
      const chunk = uniqueChannelIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '(?, ?)').join(', ');
      const params: number[] = [];
      for (const channelId of chunk) {
        params.push(subscriptionId, channelId);
      }

      await this.env.DB
        .prepare(`INSERT OR IGNORE INTO subscription_channels (subscription_id, channel_id) VALUES ${placeholders}`)
        .bind(...params)
        .run();
    }
  }

  async getSubscriptionChannels(subscriptionId: number): Promise<VerifiedChannel[]> {
    const result = await this.env.DB
      .prepare(`
        SELECT vc.* FROM verified_channels vc
        JOIN subscription_channels sc ON vc.id = sc.channel_id
        WHERE sc.subscription_id = ?
        ORDER BY vc.created_at ASC
      `)
      .bind(subscriptionId)
      .all();
    
    return result.results as VerifiedChannel[] || [];
  }

  async getChannelsForSubscriptions(subscriptionIds: number[]): Promise<Map<number, VerifiedChannel[]>> {
    const channelsBySubscription = new Map<number, VerifiedChannel[]>();

    if (subscriptionIds.length === 0) {
      return channelsBySubscription;
    }

    const chunkSize = 90;
    for (let i = 0; i < subscriptionIds.length; i += chunkSize) {
      const chunk = subscriptionIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await this.env.DB
        .prepare(`
          SELECT sc.subscription_id, vc.*
          FROM subscription_channels sc
          JOIN verified_channels vc ON vc.id = sc.channel_id
          WHERE sc.subscription_id IN (${placeholders})
          ORDER BY sc.subscription_id ASC, vc.created_at ASC
        `)
        .bind(...chunk)
        .all();

      type SubscriptionChannelRow = VerifiedChannel & { subscription_id: number };
      const rows = (result.results || []) as unknown as SubscriptionChannelRow[];

      for (const row of rows) {
        const { subscription_id, ...channelData } = row;
        const existing = channelsBySubscription.get(subscription_id) || [];
        existing.push(channelData as VerifiedChannel);
        channelsBySubscription.set(subscription_id, existing);
      }
    }

    return channelsBySubscription;
  }

  async deleteSubscriptionChannels(subscriptionId: number): Promise<void> {
    await this.env.DB
      .prepare('DELETE FROM subscription_channels WHERE subscription_id = ?')
      .bind(subscriptionId)
      .run();
  }

  async removeChannelFromSubscriptions(channelId: number): Promise<void> {
    await this.env.DB
      .prepare('DELETE FROM subscription_channels WHERE channel_id = ?')
      .bind(channelId)
      .run();
  }

  // Telegram User Links (GitHub-first architecture)
  async linkTelegramUser(telegramUserId: string, githubUserId: string): Promise<void> {
    await this.env.DB
      .prepare('INSERT OR REPLACE INTO telegram_user_links (telegram_user_id, github_user_id) VALUES (?, ?)')
      .bind(telegramUserId, githubUserId)
      .run();
  }

  async getGitHubUserByTelegramId(telegramUserId: string): Promise<string | null> {
    const result = await this.env.DB
      .prepare('SELECT github_user_id FROM telegram_user_links WHERE telegram_user_id = ?')
      .bind(telegramUserId)
      .first();
    
    return result ? result.github_user_id as string : null;
  }

  async getTelegramChannelId(githubUserId: string): Promise<number | null> {
    const result = await this.env.DB
      .prepare("SELECT id FROM verified_channels WHERE user_id = ? AND channel_type = 'telegram' LIMIT 1")
      .bind(githubUserId)
      .first();
    
    return result ? result.id as number : null;
  }

  async unlinkTelegramUser(telegramUserId: string): Promise<void> {
    await this.env.DB
      .prepare('DELETE FROM telegram_user_links WHERE telegram_user_id = ?')
      .bind(telegramUserId)
      .run();
  }
}
