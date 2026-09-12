import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { parseConfig, type EventConfig } from './config.js';

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;

export function toRawGithubUrl(url: string): string {
  const m = GITHUB_BLOB_RE.exec(url);
  if (!m) return url;
  const [, owner, repo, ref, path] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
}

function isUrl(source: string): boolean {
  return /^https?:\/\//.test(source);
}

async function readSource(source: string): Promise<string> {
  if (isUrl(source)) {
    const url = toRawGithubUrl(source);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`failed to fetch event config from ${url}: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  return readFileSync(source, 'utf8');
}

export async function loadConfigAsync(source: string): Promise<EventConfig> {
  const text = await readSource(source);
  const parsed = yaml.load(text);
  return parseConfig(parsed);
}
