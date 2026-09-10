#!/usr/bin/env node
/** Read-only daily-candidate view; collection and publication belong to the workflow. */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { buildHotSnapshot } = require('./hot-candidate-metrics.cjs');

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/poc-intel.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const rows = db.prepare(`
    SELECT keyword, trend, captured_at, expires_at, compliance
    FROM (
      SELECT keyword, trend, captured_at, expires_at, compliance,
             ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY captured_at DESC, id DESC) AS rn
      FROM signals
    ) WHERE rn = 1
  `).all();
  const requested = fs.readFileSync(path.join(__dirname, '../seeds/g2-seeds.txt'), 'utf8')
    .split('\n').map((line) => line.split('#')[0].trim()).filter(Boolean);
  const { candidates, status } = buildHotSnapshot(rows, requested, new Date().toISOString());
  fs.writeFileSync('hot-candidates.json', JSON.stringify(candidates));
  fs.writeFileSync('hot-status.json', JSON.stringify(status));
  console.log(`일간 관측값 기반 후보 ${candidates.length}건 (적격 ${status.scope.eligibleDailyCount}/${status.totalKeywords})`);
} finally {
  db.close();
}
