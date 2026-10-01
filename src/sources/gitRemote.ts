import type { GitHubRepoRef } from './types.js';

const GITHUB_URL =
  /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

/** Extracts owner/repo from a GitHub remote URL (https or ssh). Returns null for other hosts. */
export function parseGitHubUrl(url: string): GitHubRepoRef | null {
  const match = GITHUB_URL.exec(url.trim());
  return match?.[1] && match[2] ? { owner: match[1], repo: match[2] } : null;
}

/** Finds the `origin` remote in the text of a .git/config file. */
export function findOriginUrl(gitConfig: string): string | null {
  let inOrigin = false;
  for (const line of gitConfig.split(/\r\n|\n|\r/)) {
    const section = /^\s*\[(.+)\]\s*$/.exec(line);
    if (section) {
      inOrigin = /^remote\s+"origin"$/.test(section[1]?.trim() ?? '');
      continue;
    }
    const url = inOrigin ? /^\s*url\s*=\s*(.+?)\s*$/.exec(line) : null;
    if (url?.[1]) return url[1];
  }
  return null;
}
