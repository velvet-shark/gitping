import type { Env, PollState, EventMessage } from '../lib/types';
import { DatabaseService } from '../lib/db';
import { GitHubAPI } from '../lib/github';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new DatabaseService(env);
    const github = new GitHubAPI(env);
    
    // Shard repos based on current minute to distribute load
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    
    console.log(`Polling started for minute shard: ${minute}`);
    
    try {
      const repos = await db.getReposForPolling(minute);
      console.log(`Found ${repos.length} repos to poll for minute ${minute}`);
      
      // Process repos concurrently but with some limits
      const batchSize = 10;
      for (let i = 0; i < repos.length; i += batchSize) {
        const batch = repos.slice(i, i + batchSize);
        const promises = batch.map(repo => 
          ctx.waitUntil(pollRepo(env, db, github, repo))
        );
        await Promise.allSettled(promises);
      }
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }
};

async function pollRepo(
  env: Env, 
  db: DatabaseService, 
  github: GitHubAPI, 
  repo: any
): Promise<void> {
  const repoKey = `${repo.owner}/${repo.name}`;
  console.log(`Polling repo: ${repoKey}`);
  
  try {
    // Poll releases
    await pollReleases(env, db, github, repo);
    
    // Poll commits (for future implementation)
    // await pollCommits(env, db, github, repo);
    
    // Update successful polling state
    await db.updateRepoPollingState(repo.id, 0); // Reset error count
    
  } catch (error) {
    console.error(`Error polling ${repoKey}:`, error);
    
    // Increment error count
    const newErrorCount = (repo.consecutive_errors || 0) + 1;
    await db.updateRepoPollingState(repo.id, newErrorCount);
    
    // TODO: Implement exponential backoff based on consecutive_errors
  }
}

async function pollReleases(
  env: Env,
  db: DatabaseService, 
  github: GitHubAPI, 
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
    
    const releases = result.releases.filter(r => !r.draft); // Skip drafts
    
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
    
    // Find new releases (releases we haven't seen before)
    const currentLastSeenId = currentState?.lastSeenId;
    const newReleases = currentLastSeenId 
      ? releases.filter(r => r.id > parseInt(currentLastSeenId))
      : [releases[0]]; // If no previous state, take only the latest
    
    console.log(`Found ${newReleases.length} new releases for ${repo.owner}/${repo.name}`);
    
    // Process new releases
    for (const release of newReleases.reverse()) { // Process oldest first
      const eventId = await db.createEvent(
        repo.id,
        'release',
        release.id.toString(),
        release,
        Math.floor(Date.parse(release.published_at) / 1000)
      );
      
      if (eventId) {
        // Queue notification
        const message: EventMessage = {
          repo_id: repo.id,
          kind: 'release',
          external_id: release.id.toString()
        };
        
        await env.EVENTS.send(message);
        console.log(`Queued release event: ${repo.owner}/${repo.name} - ${release.tag_name}`);
      }
    }
    
    // Update state with the latest release ID we've seen
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
    
    // Update checked timestamp even on error to avoid rapid retries
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

// TODO: Implement commit polling
async function pollCommits(
  env: Env,
  db: DatabaseService, 
  github: GitHubAPI, 
  repo: any
): Promise<void> {
  // Implementation for commit polling will go here
  // This will be more complex as it needs to handle:
  // - Different branches
  // - Commit batching/digest windows
  // - Path and author filters
  
  console.log(`Commit polling not yet implemented for ${repo.owner}/${repo.name}`);
}