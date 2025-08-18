// GitPing Type Definitions

export interface Env {
  DB: D1Database;
  POLL_STATE: KVNamespace;
  EVENTS: Queue;
  TELEGRAM_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

// Database Models
export interface User {
  id: string;
  created_at: number;
  tg_chat_id?: string;
  email?: string;
  github_id?: string;
  github_username?: string;
  name?: string;
  avatar_url?: string;
}

export interface Repo {
  id: number;
  owner: string;
  name: string;
  default_branch: string;
  active_score: number;
  last_polled_at?: number;
  polling_interval: number;
  consecutive_errors: number;
}

export interface Subscription {
  id: number;
  user_id: string;
  repo_id: number;
  kind: 'release' | 'commit';
  filters_json: string;
  channels_json: string;
  created_at: number;
}

export interface Event {
  id: number;
  repo_id: number;
  kind: 'release' | 'commit';
  external_id: string;
  payload_json: string;
  occurred_at: number;
  inserted_at: number;
}

export interface Notification {
  id: number;
  event_id: number;
  subscription_id: number;
  channel: 'telegram' | 'email' | 'slack' | 'webhook';
  status: 'queued' | 'sent' | 'error';
  attempts: number;
  last_error?: string;
  last_error_at?: number;
  sent_at?: number;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
  last_used_at: number;
  user_agent?: string;
  ip_address?: string;
}

export interface ConnectionCode {
  code: string;
  user_id: string;
  expires_at: number;
  created_at: number;
  used_at?: number;
  tg_chat_id?: string;
}

// Filter Types
export interface ReleaseFilters {
  include_prereleases?: boolean;
  tag_regex?: string;
}

export interface CommitFilters {
  branch?: string;
  author?: string;
  path_pattern?: string;
}

// Channel Types
export interface TelegramChannel {
  type: 'telegram';
  chat_id: string;
}

export interface EmailChannel {
  type: 'email';
  address: string;
}

export interface SlackChannel {
  type: 'slack';
  webhook_url: string;
}

export interface WebhookChannel {
  type: 'webhook';
  url: string;
  secret?: string;
}

export type Channel = TelegramChannel | EmailChannel | SlackChannel | WebhookChannel;

// API Types
export interface CreateSubscriptionRequest {
  user_id: string;
  repo: string; // "owner/name"
  kind: 'release' | 'commit';
  filters?: ReleaseFilters | CommitFilters;
  channels: Channel[];
}

export interface ConnectTelegramRequest {
  user_id: string;
  chat_id: string;
}

// Authentication API Types
export interface GitHubOAuthCallbackRequest {
  code: string;
  state?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface GenerateConnectionCodeResponse {
  code: string;
  expires_at: number;
}

export interface LinkTelegramRequest {
  code: string;
  chat_id: string;
}

// GitHub API Types
export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
}

// Polling State in KV
export interface PollState {
  lastSeenId?: string;
  etag?: string;
  lastModified?: string;
  checkedAt: number;
}

// Queue Message Types
export interface EventMessage {
  repo_id: number;
  kind: 'release' | 'commit';
  external_id: string;
}

// Response Types
export interface EventsResponse {
  kind: 'release' | 'commit';
  external_id: string;
  occurred_at: number;
  payload: GitHubRelease | GitHubCommit;
}