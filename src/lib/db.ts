import type { Env, Repo, Subscription, Event, User } from './types';

export class DatabaseService {
  constructor(private env: Env) {}

  // Users
  async createUser(id: string, tgChatId?: string): Promise<void> {
    await this.env.DB
      .prepare('INSERT OR REPLACE INTO users (id, tg_chat_id) VALUES (?, ?)')
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

  async getReposForPolling(minute: number): Promise<Repo[]> {
    const result = await this.env.DB
      .prepare(`
        SELECT * FROM repos 
        WHERE id % 60 = ? 
        AND (consecutive_errors < 5 OR last_polled_at IS NULL OR last_polled_at < ?)
        ORDER BY last_polled_at ASC NULLS FIRST
        LIMIT 100
      `)
      .bind(minute, Date.now() - 300000) // 5 minutes ago
      .all();
    
    return (result.results || []) as Repo[];
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

  async deleteSubscription(id: number, userId: string): Promise<boolean> {
    const result = await this.env.DB
      .prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    return result.meta.changes > 0;
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
}