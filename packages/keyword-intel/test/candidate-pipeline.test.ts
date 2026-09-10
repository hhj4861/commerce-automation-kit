import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);

it('runs the read-only SQLite → daily snapshot → candidate export scripts without credentials', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cak-candidate-pipeline-'));
  try {
    const dbPath = join(cwd, 'signals.db');
    const captured = new Date(Date.now() - 60_000);
    const capturedAt = captured.toISOString();
    const expiresAt = new Date(captured.getTime() + 24 * 3600_000).toISOString();
    const day = new Date(captured.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const midnight = Date.parse(`${day}T00:00:00Z`);
    const series = Array.from({ length: 8 }, (_, i) => ({
      period: new Date(midnight - (8 - i) * 86400_000).toISOString().slice(0, 10),
      ratio: i === 7 ? 80 : 20,
    }));
    const trend = { timeUnit: 'date', startDate: series[0]!.period, endDate: day, series };
    const db = new Database(dbPath);
    db.exec('CREATE TABLE signals (id INTEGER PRIMARY KEY, keyword TEXT, trend TEXT, captured_at TEXT, expires_at TEXT, compliance TEXT)');
    const insert = db.prepare('INSERT INTO signals (keyword, trend, captured_at, expires_at, compliance) VALUES (?, ?, ?, ?, ?)');
    const compliance = JSON.stringify({ resaleRestricted: true, cacheTtlHours: 24 });
    // The old row must not become a second exported item or supply legacy metadata.
    insert.run('루테인', JSON.stringify({ series }), new Date(captured.getTime() - 1000).toISOString(), expiresAt, compliance);
    insert.run('루테인', JSON.stringify(trend), capturedAt, expiresAt, compliance);
    insert.run('outside-seed-scope', JSON.stringify(trend), capturedAt, expiresAt, compliance);
    db.close();
    const before = readFileSync(dbPath);
    // No inherited credentials or NODE_OPTIONS: the monthly phase cannot make a request.
    const env = { PATH: process.env.PATH ?? '', DB_PATH: dbPath };
    const hot = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/hot-report.cjs', import.meta.url))],
      { cwd, env, encoding: 'utf8', timeout: 10_000 });
    expect(hot.stderr).toBe('');
    expect(hot.status).toBe(0);
    const blog = spawnSync(process.execPath, ['--import', require.resolve('tsx'),
      fileURLToPath(new URL('../scripts/blog-hot-report.ts', import.meta.url))],
    { cwd, env, encoding: 'utf8', timeout: 10_000 });
    expect(blog.stderr).toBe('');
    expect(blog.status).toBe(0);
    const batch = JSON.parse(readFileSync(join(cwd, 'blog-keyword-candidates.json'), 'utf8'));
    expect(batch.scope).toMatchObject({ requestedKeywordCount: 182, storedKeywordCount: 1,
      eligibleDailyCount: 1, exportedCount: 1, truncatedCount: 0 });
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0]).toMatchObject({ keyword: '루테인', capturedAt, expiresAt,
      trend: { hotScore: 97, observedBaselineDays: 7, timeUnitOrigin: 'provider_response' },
      searchad: { lookupStatus: 'not_configured', failureCode: 'credentials_missing',
        measuredAt: null, monthlyTotal: null, monthlyTotalStatus: 'unavailable' } });
    expect(readFileSync(join(cwd, 'trend-hot-report.txt'), 'utf8')).toContain('Top 0');
    expect(readFileSync(join(cwd, 'blog-hot-report.txt'), 'utf8')).toContain('not_configured');
    expect(readFileSync(dbPath)).toEqual(before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30_000);
