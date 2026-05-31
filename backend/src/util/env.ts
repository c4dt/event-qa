export function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Accepts plain integers (ms) or values like "30d", "1h", "10m", "30s".
export function envDurationMs(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const m = /^(\d+)\s*([smhd])?$/.exec(v.trim());
  if (!m) return fallback;
  const n = Number.parseInt(m[1]!, 10);
  const unit = m[2] ?? 'ms';
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
  };
  return n * (mult[unit] ?? 1);
}
