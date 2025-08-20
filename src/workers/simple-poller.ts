// Simplified poller that processes notifications inline (no queues)
import type { Env, PollState } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';
import { TelegramAPI } from '../lib/telegram';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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
        const promises = batch.map(repo => 
          ctx.waitUntil(pollRepoAndNotify(env, db, github, telegram, repo))
        );
        await Promise.allSettled(promises);
      }
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }
};

async function pollRepoAndNotify(
  env: Env, 
  db: DatabaseService, 
  github: GitHubAPI, 
  telegram: TelegramAPI,
  repo: any
): Promise<void> {
  const repoKey = `${repo.owner}/${repo.name}`;
  console.log(`Polling repo: ${repoKey}`);
  
  try {
    // Poll releases and notify inline
    await pollReleasesAndNotify(env, db, github, telegram, repo);
    
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
  env: Env,
  db: DatabaseService, 
  github: GitHubAPI, 
  telegram: TelegramAPI,
  repo: any
): Promise<void> {
  const stateKey = `rel:${repo.owner}/${repo.name}`;
  
  // Get current state from KV
  const currentState = await env.POLL_STATE.get<PollState>(stateKey, { type: 'json' });
  
  try {
    // Fetch releases from GitHub
    const result = await github.getReleases(repo.owner, repo.name, currentState || undefined);
    
    if (result.isNotModified) {
      // No changes, just update the checked timestamp
      const newState: PollState = {
        ...currentState,
        checkedAt: Date.now()
      };
      await env.POLL_STATE.put(stateKey, JSON.stringify(newState));
      return;
    }
    
    const releases = result.releases.filter(r => !r.draft);
    
    if (releases.length === 0) {
      // No releases found, update state
      const newState: PollState = {
        lastSeenId: currentState?.lastSeenId,
        etag: result.etag,
        lastModified: result.lastModified,
        checkedAt: Date.now()
      };
      await env.POLL_STATE.put(stateKey, JSON.stringify(newState));
      return;
    }
    
    // Find new releases
    const currentLastSeenId = currentState?.lastSeenId;
    let newReleases: any[];
    
    if (currentLastSeenId) {
      // Normal case: filter by ID
      newReleases = releases.filter(r => r.id > parseInt(currentLastSeenId));
    } else {
      // First time polling: don't send notifications for existing releases
      // Just mark the latest one as seen to avoid spam
      console.log(`First time polling ${repo.owner}/${repo.name}, marking latest release as seen`);
      newReleases = [];
    }
    
    console.log(`Found ${newReleases.length} new releases for ${repo.owner}/${repo.name}`);
    
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
        await sendReleaseNotifications(db, telegram, repo, release, eventId);
        console.log(`Processed release: ${repo.owner}/${repo.name} - ${release.tag_name}`);
      }
    }
    
    // Update state
    const latestReleaseId = Math.max(...releases.map(r => r.id)).toString();
    const newState: PollState = {
      lastSeenId: latestReleaseId,
      etag: result.etag,
      lastModified: result.lastModified,
      checkedAt: Date.now()
    };
    
    await env.POLL_STATE.put(stateKey, JSON.stringify(newState));
    
  } catch (error) {
    console.error(`Error polling releases for ${repo.owner}/${repo.name}:`, error);
    
    // Update checked timestamp even on error
    if (currentState) {
      const newState: PollState = {
        ...currentState,
        checkedAt: Date.now()
      };
      await env.POLL_STATE.put(stateKey, JSON.stringify(newState));
    }
    
    throw error;
  }
}

async function sendReleaseNotifications(
  db: DatabaseService,
  telegram: TelegramAPI,
  repo: any,
  release: any,
  eventId: number
): Promise<void> {
  // Get subscriptions for this repo
  const subscriptions = await db.getSubscriptionsForRepo(repo.id, 'release');
  
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
      
      // Get verified channels for this subscription
      const channels = await db.getSubscriptionChannels(subscription.id);
      
      // Send to each channel
      for (const channel of channels) {
        const notificationId = await db.createNotification(
          eventId,
          subscription.id,
          channel.channel_type
        );
        
        try {
          if (channel.channel_type === 'telegram' && channel.channel_identifier) {
            const message = telegram.formatReleaseMessage(repo.owner, repo.name, release);
            await telegram.sendMessage(channel.channel_identifier, message, { parse_mode: 'Markdown' });
            await db.updateNotificationStatus(notificationId, 'sent');
          }
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