import type { Env, GitHubRelease, GitHubCommit, PollState } from './types';

export class GitHubAPI {
  constructor(private env: Env) {}

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'gitping/1.0',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (this.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${this.env.GITHUB_TOKEN}`;
    }

    return headers;
  }

  async fetch(
    url: string, 
    options: {
      etag?: string;
      lastModified?: string;
    } = {}
  ): Promise<Response> {
    const headers = { ...this.headers };

    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }
    if (options.lastModified) {
      headers['If-Modified-Since'] = options.lastModified;
    }

    const response = await fetch(url, { headers });
    
    // Log rate limit info for monitoring
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    
    if (remaining && parseInt(remaining) < 100) {
      console.warn(`GitHub API rate limit low: ${remaining} requests remaining, resets at ${reset}`);
    }

    return response;
  }

  async getReleases(
    owner: string, 
    repo: string, 
    state?: PollState
  ): Promise<{
    releases: GitHubRelease[];
    etag?: string;
    lastModified?: string;
    isNotModified: boolean;
  }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;
    
    const response = await this.fetch(url, {
      etag: state?.etag,
      lastModified: state?.lastModified
    });

    if (response.status === 304) {
      return {
        releases: [],
        etag: state?.etag,
        lastModified: state?.lastModified,
        isNotModified: true
      };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases: GitHubRelease[] = await response.json();
    
    return {
      releases: releases.filter(r => !r.draft), // Filter out drafts
      etag: response.headers.get('etag') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
      isNotModified: false
    };
  }

  async getCommits(
    owner: string, 
    repo: string, 
    branch: string = 'main',
    state?: PollState
  ): Promise<{
    commits: GitHubCommit[];
    etag?: string;
    lastModified?: string;
    isNotModified: boolean;
  }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=10`;
    
    const response = await this.fetch(url, {
      etag: state?.etag,
      lastModified: state?.lastModified
    });

    if (response.status === 304) {
      return {
        commits: [],
        etag: state?.etag,
        lastModified: state?.lastModified,
        isNotModified: true
      };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const commits: GitHubCommit[] = await response.json();
    
    return {
      commits,
      etag: response.headers.get('etag') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
      isNotModified: false
    };
  }

  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<{
    commits: GitHubCommit[];
    html_url: string;
  }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`;
    
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      commits: data.commits || [],
      html_url: data.html_url
    };
  }

  async getRepository(owner: string, repo: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}