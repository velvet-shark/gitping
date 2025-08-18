-- GitPing Database Migration: Add Web Authentication Support
-- Run this migration to add GitHub OAuth and session support

-- Add GitHub OAuth fields to users table (without UNIQUE constraint)
-- We'll add the unique constraint via index instead
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN github_id TEXT;
ALTER TABLE users ADD COLUMN github_username TEXT;
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Add sessions table for web authentication
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id_unique ON users(github_id) WHERE github_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username);

-- Add connection_codes table for Telegram linking
CREATE TABLE IF NOT EXISTS connection_codes (
  code TEXT PRIMARY KEY,               -- 6-digit random code
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,         -- expire in 10 minutes
  created_at INTEGER DEFAULT (strftime('%s','now')),
  used_at INTEGER,                     -- when the code was used
  tg_chat_id TEXT,                     -- filled when bot uses the code
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_connection_codes_expires ON connection_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_connection_codes_user ON connection_codes(user_id);