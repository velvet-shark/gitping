-- Add missing indexes to prevent full table scans on subscription deletes and event listing
CREATE INDEX IF NOT EXISTS idx_notifications_subscription ON notifications(subscription_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at DESC);
