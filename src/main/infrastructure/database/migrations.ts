import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: string
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_orchestration_schema',
    up: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        objective TEXT NOT NULL,
        state TEXT NOT NULL,
        provider TEXT NOT NULL,
        profile TEXT NOT NULL,
        retry_policy_json TEXT NOT NULL,
        verification_json TEXT NOT NULL,
        power_policy_json TEXT NOT NULL,
        automatic_attempts INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        next_action_at TEXT,
        state_reason TEXT
      );

      CREATE TABLE job_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_session_id TEXT,
        provider_turn_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        stop_reason TEXT,
        UNIQUE(job_id, attempt_number)
      );

      CREATE TABLE provider_sessions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        resumable INTEGER NOT NULL DEFAULT 1 CHECK (resumable IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, external_id)
      );

      CREATE TABLE job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES job_attempts(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE schedules (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES job_attempts(id) ON DELETE SET NULL,
        provider_request_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        UNIQUE(job_id, provider_request_id)
      );

      CREATE TABLE verification_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );

      CREATE TABLE verification_checks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
        config_id TEXT NOT NULL,
        label TEXT NOT NULL,
        command TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        exit_code INTEGER,
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        output TEXT NOT NULL,
        error TEXT
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_jobs_state ON jobs(state, archived);
      CREATE INDEX idx_jobs_project_state ON jobs(project_id, state);
      CREATE INDEX idx_attempts_job ON job_attempts(job_id, attempt_number DESC);
      CREATE INDEX idx_events_job_created ON job_events(job_id, created_at DESC);
      CREATE INDEX idx_schedules_due ON schedules(status, due_at);
      CREATE INDEX idx_approvals_pending ON approvals(status, created_at);
      CREATE INDEX idx_verification_job ON verification_runs(job_id, started_at DESC);
    `
  },
  {
    version: 2,
    name: 'profiles_and_retention_support',
    up: `
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_retention ON job_events(created_at, job_id);
    `
  },
  {
    version: 3,
    name: 'remove_manual_codex_executable_override',
    up: `DELETE FROM settings WHERE key = 'codexExecutablePath';`
  }
]

export function migrate(database: Database.Database): number {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)
  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => Number((row as { version: number }).version))
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    const apply = database.transaction(() => {
      database.exec(migration.up)
      database
        .prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })
    apply()
  }
  return currentSchemaVersion(database)
}

export function currentSchemaVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number }
  return Number(row.version)
}
