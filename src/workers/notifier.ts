import type { Env, EventMessage, GitHubRelease, Channel } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { TelegramAPI } from '../lib/telegram';

export default {
  async queue(batch: MessageBatch<EventMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new DatabaseService(env);
    const telegram = new TelegramAPI(env);
    
    console.log(`Processing ${batch.messages.length} notification messages`);
    
    for (const message of batch.messages) {
      try {
        await processEventMessage(message.body, env, db, telegram, ctx);
        message.ack();
      } catch (error) {
        console.error('Error processing notification message:', error);
        // Don't ack the message so it gets retried
        message.retry();
      }
    }
  }
};

async function processEventMessage(
  eventMessage: EventMessage,
  env: Env,
  db: DatabaseService,
  telegram: TelegramAPI,
  ctx: ExecutionContext
): Promise<void> {
  const { repo_id, kind, external_id } = eventMessage;
  
  console.log(`Processing ${kind} event: ${external_id} for repo ${repo_id}`);
  
  // Get subscriptions for this repo and event type
  const subscriptions = await db.getSubscriptionsForRepo(repo_id, kind);
  
  if (subscriptions.length === 0) {
    console.log(`No subscriptions found for repo ${repo_id}, kind ${kind}`);
    return;
  }
  
  // Get the event details
  const events = await db.getEvents(repo_id, kind, 1);
  const event = events.find(e => e.external_id === external_id);
  
  if (!event) {
    console.error(`Event not found: repo_id=${repo_id}, external_id=${external_id}`);
    return;
  }
  
  const repo = await db.getRepoById(repo_id);
  if (!repo) {
    console.error(`Repo not found: ${repo_id}`);
    return;
  }
  
  console.log(`Found ${subscriptions.length} subscriptions for ${repo.owner}/${repo.name}`);
  
  // Process each subscription
  for (const subscription of subscriptions) {
    ctx.waitUntil(
      processSubscription(subscription, event, repo, db, telegram)
    );
  }
}

async function processSubscription(
  subscription: any,
  event: any,
  repo: any,
  db: DatabaseService,
  telegram: TelegramAPI
): Promise<void> {
  try {
    const filters = JSON.parse(subscription.filters_json);
    const channels: Channel[] = JSON.parse(subscription.channels_json);
    const payload = JSON.parse(event.payload_json);
    
    // Apply filters
    if (!shouldNotify(event.kind, payload, filters)) {
      console.log(`Filters not matched for subscription ${subscription.id}`);
      return;
    }
    
    // Send notifications to each channel
    for (const channel of channels) {
      const notificationId = await db.createNotification(
        event.id,
        subscription.id,
        channel.type
      );
      
      try {
        await sendNotification(channel, event.kind, payload, repo, telegram);
        await db.updateNotificationStatus(notificationId, 'sent');
        console.log(`Sent ${channel.type} notification for ${repo.owner}/${repo.name}`);
        
      } catch (error) {
        console.error(`Failed to send ${channel.type} notification:`, error);
        await db.updateNotificationStatus(
          notificationId, 
          'error', 
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
  } catch (error) {
    console.error(`Error processing subscription ${subscription.id}:`, error);
  }
}

function shouldNotify(
  kind: 'release' | 'commit',
  payload: any,
  filters: any
): boolean {
  if (kind === 'release') {
    const release: GitHubRelease = payload;
    
    // Check prerelease filter
    if (filters.include_prereleases === false && release.prerelease) {
      return false;
    }
    
    // Check tag regex filter
    if (filters.tag_regex) {
      const regex = new RegExp(filters.tag_regex);
      if (!regex.test(release.tag_name)) {
        return false;
      }
    }
    
    return true;
  }
  
  if (kind === 'commit') {
    // TODO: Implement commit filters
    // - branch filter
    // - author filter  
    // - path pattern filter
    return true;
  }
  
  return false;
}

async function sendNotification(
  channel: Channel,
  kind: 'release' | 'commit',
  payload: any,
  repo: any,
  telegram: TelegramAPI
): Promise<void> {
  switch (channel.type) {
    case 'telegram': {
      if (!channel.chat_id) {
        throw new Error('Missing chat_id for Telegram channel');
      }
      
      let message: string;
      
      if (kind === 'release') {
        message = telegram.formatReleaseMessage(repo.owner, repo.name, payload);
      } else if (kind === 'commit') {
        message = telegram.formatCommitMessage(repo.owner, repo.name, [payload]);
      } else {
        throw new Error(`Unknown event kind: ${kind}`);
      }
      
      await telegram.sendMessage(channel.chat_id, message, {
        parse_mode: 'Markdown'
      });
      break;
    }
    
    case 'email': {
      // TODO: Implement email notifications
      throw new Error('Email notifications not yet implemented');
    }
    
    case 'slack': {
      // TODO: Implement Slack notifications
      throw new Error('Slack notifications not yet implemented');
    }
    
    case 'webhook': {
      // TODO: Implement webhook notifications
      throw new Error('Webhook notifications not yet implemented');
    }
    
    default: {
      throw new Error(`Unknown channel type: ${(channel as any).type}`);
    }
  }
}

// Retry failed notifications (to be called periodically)
export async function retryFailedNotifications(env: Env): Promise<void> {
  const db = new DatabaseService(env);
  const telegram = new TelegramAPI(env);
  
  const failedNotifications = await db.getFailedNotifications(3); // Max 3 attempts
  
  console.log(`Retrying ${failedNotifications.length} failed notifications`);
  
  for (const notification of failedNotifications) {
    try {
      const channels: Channel[] = JSON.parse(notification.channels_json);
      const channel = channels.find(c => c.type === notification.channel);
      
      if (!channel) {
        console.error(`Channel not found for notification ${notification.id}`);
        continue;
      }
      
      const payload = JSON.parse(notification.payload_json);
      const repo = { owner: notification.owner, name: notification.name };
      
      await sendNotification(channel, notification.kind, payload, repo, telegram);
      await db.updateNotificationStatus(notification.id, 'sent');
      
      console.log(`Retried notification ${notification.id} successfully`);
      
    } catch (error) {
      console.error(`Retry failed for notification ${notification.id}:`, error);
      await db.updateNotificationStatus(
        notification.id,
        'error',
        error instanceof Error ? error.message : 'Retry failed'
      );
    }
  }
}