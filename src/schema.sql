-- GitPing Database Schema

-- Users: support both anonymous (Telegram-only) and authenticated (web) users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- uuid
  created_at INTEGER DEFAULT (strftime('%s','now')),
  tg_chat_id TEXT,                     -- for Telegram delivery (optional)
  email TEXT,                          -- from GitHub OAuth (optional)
  github_id TEXT UNIQUE,               -- GitHub user ID for OAuth
  github_username TEXT,                -- GitHub username
  name TEXT,                           -- Display name from GitHub
  avatar_url TEXT                      -- Profile picture from GitHub
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

-- Web authentication sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                  -- JWT token ID or session ID
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,          -- epoch seconds
  created_at INTEGER DEFAULT (strftime('%s','now')),
  last_used_at INTEGER DEFAULT (strftime('%s','now')),
  user_agent TEXT,                      -- Optional: track user agent
  ip_address TEXT,                      -- Optional: track IP for security
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Connection codes for linking Telegram to web accounts
CREATE TABLE IF NOT EXISTS connection_codes (
  code TEXT PRIMARY KEY,               -- 6-digit random code
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,         -- expire in 10 minutes
  created_at INTEGER DEFAULT (strftime('%s','now')),
  used_at INTEGER,                     -- when the code was used
  tg_chat_id TEXT,                     -- filled when bot uses the code
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Verified channels for web users (Telegram, Email, Slack, etc.)
CREATE TABLE IF NOT EXISTS verified_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'telegram',  -- 'telegram', 'email', 'slack', etc.
  channel_identifier TEXT NOT NULL,               -- chat_id, email address, webhook URL
  display_name TEXT,                               -- User-friendly name
  verified_at INTEGER NOT NULL,                    -- when the channel was verified
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, channel_type, channel_identifier)
);

-- Link subscriptions to verified channels (many-to-many)
CREATE TABLE IF NOT EXISTS subscription_channels (
  subscription_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (subscription_id, channel_id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES verified_channels(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subs_user_repo ON subscriptions(user_id, repo_id);
CREATE INDEX IF NOT EXISTS idx_subs_repo_kind ON subscriptions(repo_id, kind);
CREATE INDEX IF NOT EXISTS idx_events_repo_kind ON events(repo_id, kind, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_inserted ON events(inserted_at);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, attempts);
CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_repos_polling ON repos(last_polled_at, consecutive_errors);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username);
CREATE INDEX IF NOT EXISTS idx_connection_codes_expires ON connection_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_connection_codes_user ON connection_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verified_channels_user ON verified_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_verified_channels_type ON verified_channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_subscription_channels_sub ON subscription_channels(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_channels_channel ON subscription_channels(channel_id);