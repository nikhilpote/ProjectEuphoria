/**
 * Simple SQL file migration runner.
 * Runs SQL migration files in order, tracking applied migrations in a
 * schema_migrations table. Safe to run multiple times (idempotent).
 *
 * Usage: npx tsx src/database/migrate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');

      const { rows } = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version],
      );

      if ((rows as { version: string }[]).length > 0) {
        console.log(`  [skip] ${version} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version],
        );
        await client.query('COMMIT');
        console.log(`  [ok]   ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [fail] ${version}:`, err);
        throw err;
      }
    }

    console.log('Migrations complete.');

    // ── Run seeds (idempotent — every file uses ON CONFLICT) ──
    const seedsDir = path.join(__dirname, 'seeds');
    if (fs.existsSync(seedsDir)) {
      const seedFiles = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of seedFiles) {
        try {
          const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
          await client.query(sql);
          console.log(`  [seed] ${file}`);
        } catch (err) {
          console.error(`  [seed-fail] ${file}:`, err);
          throw err;
        }
      }
      console.log('Seeds complete.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
