import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Pool } from "pg";

type Row = Record<string, unknown>;
type QueryFn = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

type Database = {
  query: QueryFn;
  transaction: <T>(run: (query: QueryFn) => Promise<T>) => Promise<T>;
};

const LOCAL_DATABASE_DIR = path.resolve(process.cwd(), ".data", "portal-db");

// 順番に1回ずつ流す。流したものは書き換えず、変更は末尾に足す。
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_members_and_logins",
    sql: `
      CREATE TABLE members (
        id text PRIMARY KEY,
        team_slug text NOT NULL,
        name text NOT NULL,
        grade integer,
        position text,
        is_leader boolean NOT NULL DEFAULT false,
        role text NOT NULL DEFAULT 'member',
        title text,
        tier text,
        slot text,
        slack_id text,
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (team_slug, name)
      );

      CREATE TABLE login_logs (
        id text PRIMARY KEY,
        team_slug text NOT NULL,
        at timestamptz NOT NULL DEFAULT now(),
        result text NOT NULL,
        member_id text,
        member_name text,
        ip text,
        user_agent text,
        device_id text,
        new_device boolean NOT NULL DEFAULT false
      );
      CREATE INDEX login_logs_team_at ON login_logs (team_slug, at DESC);
      CREATE INDEX login_logs_ip_at ON login_logs (ip, at DESC);

      CREATE TABLE member_devices (
        member_id text NOT NULL REFERENCES members (id),
        device_id text NOT NULL,
        user_agent text,
        last_ip text,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, device_id)
      );
    `,
  },
];

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

function createPostgresDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 3 });

  return {
    query: async (text, params) => (await pool.query(text, params)).rows,
    transaction: async (run) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await run(async (text, params) => (await client.query(text, params)).rows);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function createLocalDatabase(): Promise<Database> {
  await mkdir(LOCAL_DATABASE_DIR, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(LOCAL_DATABASE_DIR);

  return {
    query: async <T extends Row>(text: string, params?: unknown[]) =>
      (await db.query<T>(text, params)).rows,
    transaction: (run) =>
      db.transaction((tx) =>
        run(async <T extends Row>(text: string, params?: unknown[]) =>
          (await tx.query<T>(text, params)).rows,
        ),
      ),
  };
}

async function runStatements(query: QueryFn, sql: string) {
  for (const statement of sql.split(";")) {
    if (statement.trim()) {
      await query(statement);
    }
  }
}

async function migrate(db: Database, useAdvisoryLock: boolean) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  await db.transaction(async (query) => {
    if (useAdvisoryLock) {
      await query("SELECT pg_advisory_xact_lock(720261011)");
    }
    const applied = new Set(
      (await query<{ id: string }>("SELECT id FROM schema_migrations")).map((row) => row.id),
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) {
        continue;
      }
      await runStatements(query, migration.sql);
      await query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
    }
  });
}

async function openDatabase(): Promise<Database> {
  const connectionString = getDatabaseUrl();
  if (connectionString) {
    const db = createPostgresDatabase(connectionString);
    await migrate(db, true);
    return db;
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "Vercel ではデータベースが必要です。環境変数 `DATABASE_URL` を設定してください。",
    );
  }

  const db = await createLocalDatabase();
  await migrate(db, false);
  return db;
}

// 開発中のホットリロードで接続が増えないよう、プロセスに1つだけ持つ。
const globalStore = globalThis as typeof globalThis & { __portalDatabase?: Promise<Database> };

function getDatabase(): Promise<Database> {
  if (!globalStore.__portalDatabase) {
    globalStore.__portalDatabase = openDatabase().catch((error) => {
      globalStore.__portalDatabase = undefined;
      throw error;
    });
  }
  return globalStore.__portalDatabase;
}

export async function query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> {
  return (await getDatabase()).query<T>(text, params);
}

export async function transaction<T>(run: (query: QueryFn) => Promise<T>): Promise<T> {
  return (await getDatabase()).transaction(run);
}
