import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toRawGithubUrl, loadConfigAsync } from '../src/config-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(here, '..', '..', 'event.example.yaml');

const validYaml = `
event:
  name: "My Conference 2026"
  place: "EPFL"
  start: 2026-06-01
  end: 2026-06-02
rooms:
  - id: main
    name: "Main Hall"
speakers:
  - id: ada
    name: "Ada"
admins:
  - alias: admin
    password: "$argon2id$v=19$m=65536,t=3,p=4$abc$def"
tracks:
  - id: main-track
    name: "Main Track"
    talks:
      - id: opening
        title: "Opening"
        start: "2026-06-01T09:00:00+02:00"
        duration_min: 45
        speakers: [ada]
        room: main
`;

describe('toRawGithubUrl', () => {
  it('rewrites a github.com blob URL to raw.githubusercontent.com', () => {
    expect(toRawGithubUrl('https://github.com/acme/conf/blob/main/event.yaml')).toBe(
      'https://raw.githubusercontent.com/acme/conf/main/event.yaml',
    );
  });

  it('leaves non-blob URLs unchanged', () => {
    const raw = 'https://raw.githubusercontent.com/acme/conf/main/event.yaml';
    expect(toRawGithubUrl(raw)).toBe(raw);
    const other = 'https://gitlab.com/acme/conf/-/raw/main/event.yaml';
    expect(toRawGithubUrl(other)).toBe(other);
  });
});

describe('loadConfigAsync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads and parses a local file path', async () => {
    const cfg = await loadConfigAsync(examplePath);
    expect(cfg.event.name).toBeTruthy();
    expect(cfg.tracks.length).toBeGreaterThan(0);
  });

  it('fetches and parses a URL, converting github blob links to raw', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://raw.githubusercontent.com/acme/conf/main/event.yaml');
      return { ok: true, status: 200, statusText: 'OK', text: async () => validYaml };
    });
    vi.stubGlobal('fetch', fetchMock);

    const cfg = await loadConfigAsync('https://github.com/acme/conf/blob/main/event.yaml');
    expect(cfg.event.name).toBe('My Conference 2026');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' })),
    );

    await expect(loadConfigAsync('https://github.com/acme/conf/blob/main/missing.yaml')).rejects.toThrow(
      /404/,
    );
  });
});
