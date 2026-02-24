// Simplified poller that processes notifications inline (no queues)
import type { Env, PollingRepo, PollState, Subscription, VerifiedChannel } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';
import { TelegramAPI } from '../lib/telegram';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    void ctx;
    const db = new DatabaseService(env);
    const github = new GitHubAPI(env);
    const telegram = new TelegramAPI(env);
    
    // Shard repos based on current minute to distribute load
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    
    console.log(`Polling started for minute shard: ${minute}`);
    
    try {
      const repos = await db.getReposForPolling(minute);
      console.log(`Found ${repos.length} repos to poll for minute ${minute}`);
      
      // Process repos with some concurrency control
      const batchSize = 5; // Smaller batches for free plan
      for (let i = 0; i < repos.length; i += batchSize) {
        const batch = repos.slice(i, i + batchSize);
        const promises = batch.map(repo => pollRepoAndNotify(db, github, telegram, repo));
        await Promise.allSettled(promises);
      }
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }
};

async function pollRepoAndNotify(
  db: DatabaseService, 
  github: GitHubAPI, 
  telegram: TelegramAPI,
  repo: PollingRepo
): Promise<void> {
  const repoKey = `${repo.owner}/${repo.name}`;
  console.log(`Polling repo: ${repoKey}`);
  
  try {
    // Poll releases and notify inline
    await pollReleasesAndNotify(db, github, telegram, repo);
    
    // Update successful polling state
    await db.updateRepoPollingState(repo.id, 0);
    
  } catch (error) {
    console.error(`Error polling ${repoKey}:`, error);
    
    // Increment error count
    const newErrorCount = (repo.consecutive_errors || 0) + 1;
    await db.updateRepoPollingState(repo.id, newErrorCount);
  }
}

async function pollReleasesAndNotify(
  db: DatabaseService, 
  github: GitHubAPI, 
  telegram: TelegramAPI,
  repo: PollingRepo
): Promise<void> {
  const currentState = getRepoPollState(repo);
  
  try {
    // Fetch releases from GitHub
    const result = await github.getReleases(repo.owner, repo.name, currentState || undefined);
    
    if (result.isNotModified) {
      // Poll state unchanged - no write needed.
      return;
    }
    
    const releases = result.releases.filter(r => !r.draft);
    
    if (releases.length === 0) {
      // No releases found, update state
      const newState: PollState = {
        lastSeenId: currentState?.lastSeenId,
        etag: result.etag || currentState?.etag,
        lastModified: result.lastModified || currentState?.lastModified
      };
      await db.updateRepoReleasePollState(repo.id, newState);
      return;
    }
    
    // Find new releases
    const currentLastSeenId = currentState?.lastSeenId;
    let newReleases: any[];
    
    if (currentLastSeenId) {
      // Normal case: filter by ID
      const lastSeenReleaseId = Number.parseInt(currentLastSeenId, 10);
      if (Number.isNaN(lastSeenReleaseId)) {
        console.warn(`Invalid lastSeenId in poll state for ${repo.owner}/${repo.name}`);
        newReleases = [];
      } else {
        newReleases = releases.filter(r => r.id > lastSeenReleaseId);
      }
    } else {
      // First time polling: don't send notifications for existing releases
      // Just mark the latest one as seen to avoid spam
      console.log(`First time polling ${repo.owner}/${repo.name}, marking latest release as seen`);
      newReleases = [];
    }
    
    console.log(`Found ${newReleases.length} new releases for ${repo.owner}/${repo.name}`);
    
    if (newReleases.length > 0) {
      // Load subscriptions/channels once and reuse for each new release.
      const subscriptions = await db.getSubscriptionsForRepo(repo.id, 'release');
      const channelsBySubscription = await db.getChannelsForSubscriptions(
        subscriptions.map((subscription) => subscription.id)
      );

      // Process new releases and send notifications immediately
      for (const release of newReleases.reverse()) {
        const eventId = await db.createEvent(
          repo.id,
          'release',
          release.id.toString(),
          release,
          Math.floor(Date.parse(release.published_at) / 1000)
        );
        
        if (eventId) {
          // Send notifications inline instead of queueing
          await sendReleaseNotifications(
            db,
            telegram,
            repo,
            release,
            eventId,
            subscriptions,
            channelsBySubscription
          );
          console.log(`Processed release: ${repo.owner}/${repo.name} - ${release.tag_name}`);
        }
      }
    }
    
    // Update state
    const latestReleaseId = Math.max(...releases.map(r => r.id)).toString();
    const newState: PollState = {
      lastSeenId: latestReleaseId,
      etag: result.etag || currentState?.etag,
      lastModified: result.lastModified || currentState?.lastModified
    };
    
    await db.updateRepoReleasePollState(repo.id, newState);
    
  } catch (error) {
    console.error(`Error polling releases for ${repo.owner}/${repo.name}:`, error);
    throw error;
  }
}

async function sendReleaseNotifications(
  db: DatabaseService,
  telegram: TelegramAPI,
  repo: PollingRepo,
  release: any,
  eventId: number,
  subscriptions: Subscription[],
  channelsBySubscription: Map<number, VerifiedChannel[]>
): Promise<void> {
  const releaseMessage = telegram.formatReleaseMessage(repo.owner, repo.name, release);
  
  for (const subscription of subscriptions) {
    try {
      const filters = JSON.parse(subscription.filters_json);
      
      // Apply filters
      if (filters.include_prereleases === false && release.prerelease) {
        continue;
      }
      
      if (filters.tag_regex) {
        try {
          const regex = new RegExp(filters.tag_regex);
          if (!regex.test(release.tag_name)) {
            continue;
          }
        } catch (error) {
          console.warn(`Invalid tag_regex: ${filters.tag_regex}`);
        }
      }
      
      const channels = resolveChannels(
        subscription.channels_json,
        channelsBySubscription.get(subscription.id) || []
      );
      
      // Send to each channel
      for (const channel of channels) {
        const notificationId = await db.createNotification(
          eventId,
          subscription.id,
          channel.channel_type
        );
        
        try {
          if (channel.channel_type !== 'telegram') {
            throw new Error(`Unsupported channel type: ${channel.channel_type}`);
          }
          if (!channel.channel_identifier) {
            throw new Error('Missing Telegram chat identifier');
          }

          await telegram.sendMessage(channel.channel_identifier, releaseMessage, { parse_mode: 'HTML' });
          await db.updateNotificationStatus(notificationId, 'sent');
        } catch (error) {
          console.error(`Failed to send notification:`, error);
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
}

function getRepoPollState(repo: PollingRepo): PollState | undefined {
  if (!repo.release_last_seen_id && !repo.release_etag && !repo.release_last_modified) {
    return undefined;
  }

  return {
    lastSeenId: repo.release_last_seen_id || undefined,
    etag: repo.release_etag || undefined,
    lastModified: repo.release_last_modified || undefined
  };
}

function resolveChannels(channelsJson: string, verifiedChannels: VerifiedChannel[]): Array<{
  channel_type: string;
  channel_identifier: string;
}> {
  if (verifiedChannels.length > 0) {
    return verifiedChannels
      .filter((channel) => Boolean(channel.channel_identifier))
      .map((channel) => ({
        channel_type: channel.channel_type,
        channel_identifier: channel.channel_identifier
      }));
  }

  try {
    const parsed = JSON.parse(channelsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((channel: any) => {
        if (!channel || typeof channel.type !== 'string') {
          return null;
        }

        if (channel.type === 'telegram' && typeof channel.chat_id === 'string') {
          return { channel_type: 'telegram', channel_identifier: channel.chat_id };
        }
        if (channel.type === 'email' && typeof channel.address === 'string') {
          return { channel_type: 'email', channel_identifier: channel.address };
        }
        if (channel.type === 'slack' && typeof channel.webhook_url === 'string') {
          return { channel_type: 'slack', channel_identifier: channel.webhook_url };
        }
        if (channel.type === 'webhook' && typeof channel.url === 'string') {
          return { channel_type: 'webhook', channel_identifier: channel.url };
        }

        return null;
      })
      .filter((channel): channel is { channel_type: string; channel_identifier: string } => channel !== null);
  } catch (error) {
    console.warn('Invalid channels_json payload on subscription');
    return [];
  }
}
