-- GitPing Database Schema

-- Users can be anonymous at first; expand with auth later
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- uuid
  created_at INTEGER DEFAULT (strftime('%s','now')),
  tg_chat_id TEXT                      -- for Telegram delivery
);

-- Repository tracking
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  active_score REAL DEFAULT 0,
  last_polled_at INTEGER,
  polling_interval INTEGER DEFAULT 60, -- minutes, for adaptive polling
  consecutive_errors INTEGER DEFAULT 0, -- for backoff
  UNIQUE(owner, name)
);

-- Subscriptions: kind 'release' | 'commit'
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  repo_id INTEGER NOT NULL,
  kind TEXT CHECK (kind IN ('release','commit')) NOT NULL,
  filters_json TEXT DEFAULT '{}',      -- e.g. {include_prereleases:false, branch:'main', tag_regex:'^v\\d+\\.\\d+\\.\\d+'}
  channels_json TEXT NOT NULL,         -- e.g. [{"type":"telegram","chat_id":"..."}]
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

-- Events: releases and commits
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                  -- release|commit
  external_id TEXT NOT NULL,           -- release id or commit sha
  payload_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,        -- epoch seconds
  inserted_at INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(repo_id, kind, external_id),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

-- Notification delivery tracking
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  subscription_id INTEGER NOT NULL,
  channel TEXT NOT NULL,               -- 'telegram' | 'email' | 'slack' | 'webhook'
  status TEXT DEFAULT 'queued',        -- 'queued' | 'sent' | 'error'
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at INTEGER,
  sent_at INTEGER,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subs_user_repo ON subscriptions(user_id, repo_id);
CREATE INDEX IF NOT EXISTS idx_subs_repo_kind ON subscriptions(repo_id, kind);
CREATE INDEX IF NOT EXISTS idx_events_repo_kind ON events(repo_id, kind, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_inserted ON events(inserted_at);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, attempts);
CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_repos_polling ON repos(last_polled_at, consecutive_errors);