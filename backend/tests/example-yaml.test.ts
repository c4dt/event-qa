import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(here, '..', '..', 'event.example.yaml');

describe('event.example.yaml', () => {
  it('parses against the zod schema', () => {
    const cfg = loadConfig(examplePath);
    expect(cfg.event.name).toBeTruthy();
    expect(cfg.tracks.length).toBeGreaterThan(0);
    expect(cfg.admins.length).toBeGreaterThan(0);
  });
});
