// Filter utilities for GitPing subscriptions

import type { GitHubRelease, GitHubCommit, ReleaseFilters, CommitFilters } from '../lib/types';

export function shouldNotifyRelease(
  release: GitHubRelease, 
  filters: ReleaseFilters
): boolean {
  // Skip drafts (should be filtered earlier, but double-check)
  if (release.draft) {
    return false;
  }

  // Check prerelease filter
  if (filters.include_prereleases === false && release.prerelease) {
    return false;
  }

  // Check tag regex filter
  if (filters.tag_regex) {
    try {
      const regex = new RegExp(filters.tag_regex);
      if (!regex.test(release.tag_name)) {
        return false;
      }
    } catch (error) {
      console.warn(`Invalid tag_regex: ${filters.tag_regex}`, error);
      // If regex is invalid, skip this filter (don't block the notification)
    }
  }

  return true;
}

export function shouldNotifyCommit(
  commit: GitHubCommit,
  filters: CommitFilters,
  context: {
    branch?: string;
    changedFiles?: string[];
  } = {}
): boolean {
  // Check branch filter
  if (filters.branch && context.branch && context.branch !== filters.branch) {
    return false;
  }

  // Check author filter
  if (filters.author) {
    const authorName = commit.commit.author.name.toLowerCase();
    const authorEmail = commit.commit.author.email.toLowerCase();
    const filterAuthor = filters.author.toLowerCase();
    
    if (!authorName.includes(filterAuthor) && !authorEmail.includes(filterAuthor)) {
      return false;
    }
  }

  // Check path pattern filter
  if (filters.path_pattern && context.changedFiles) {
    try {
      const regex = new RegExp(filters.path_pattern);
      const hasMatchingFile = context.changedFiles.some(file => regex.test(file));
      if (!hasMatchingFile) {
        return false;
      }
    } catch (error) {
      console.warn(`Invalid path_pattern regex: ${filters.path_pattern}`, error);
      // If regex is invalid, skip this filter
    }
  }

  return true;
}

// Utility to validate filter objects
export function validateReleaseFilters(filters: any): ReleaseFilters {
  const validated: ReleaseFilters = {};

  if (typeof filters.include_prereleases === 'boolean') {
    validated.include_prereleases = filters.include_prereleases;
  }

  if (typeof filters.tag_regex === 'string' && filters.tag_regex.trim()) {
    try {
      // Test if the regex is valid
      new RegExp(filters.tag_regex);
      validated.tag_regex = filters.tag_regex.trim();
    } catch (error) {
      throw new Error(`Invalid tag_regex: ${filters.tag_regex}`);
    }
  }

  return validated;
}

export function validateCommitFilters(filters: any): CommitFilters {
  const validated: CommitFilters = {};

  if (typeof filters.branch === 'string' && filters.branch.trim()) {
    validated.branch = filters.branch.trim();
  }

  if (typeof filters.author === 'string' && filters.author.trim()) {
    validated.author = filters.author.trim();
  }

  if (typeof filters.path_pattern === 'string' && filters.path_pattern.trim()) {
    try {
      // Test if the regex is valid
      new RegExp(filters.path_pattern);
      validated.path_pattern = filters.path_pattern.trim();
    } catch (error) {
      throw new Error(`Invalid path_pattern regex: ${filters.path_pattern}`);
    }
  }

  return validated;
}

// Common filter presets
export const RELEASE_FILTER_PRESETS = {
  STABLE_ONLY: { include_prereleases: false },
  ALL_RELEASES: { include_prereleases: true },
  SEMANTIC_VERSIONS: { 
    include_prereleases: false, 
    tag_regex: '^v?\\d+\\.\\d+\\.\\d+$' 
  },
  MAJOR_VERSIONS: { 
    include_prereleases: false, 
    tag_regex: '^v?\\d+\\.0\\.0$' 
  }
};

export const COMMIT_FILTER_PRESETS = {
  MAIN_BRANCH: { branch: 'main' },
  DEVELOP_BRANCH: { branch: 'develop' },
  SOURCE_CODE_ONLY: { path_pattern: '\\.(js|ts|py|go|rs|java|cpp|c)$' },
  DOCS_ONLY: { path_pattern: '\\.(md|rst|txt|doc)$|docs/|documentation/' }
};