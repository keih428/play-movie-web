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
  {
    id: "002_training",
    // 日付は 'YYYY-MM-DD' の文字で持つ(時差で日がずれないように)。
    sql: `
      CREATE TABLE training_menus (
        team_slug text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE training_logs (
        member_id text NOT NULL REFERENCES members (id),
        week_start text NOT NULL,
        day text NOT NULL,
        exercise text NOT NULL,
        lift text,
        weight_kg double precision NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, week_start, day, exercise)
      );
      CREATE INDEX training_logs_week ON training_logs (week_start);

      CREATE TABLE training_memos (
        member_id text NOT NULL REFERENCES members (id),
        week_start text NOT NULL,
        day text NOT NULL,
        memo text NOT NULL DEFAULT '',
        request text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, week_start, day)
      );
      CREATE INDEX training_memos_week ON training_memos (week_start);

      CREATE TABLE measurements (
        member_id text NOT NULL REFERENCES members (id),
        measured_on text NOT NULL,
        item text NOT NULL,
        value double precision NOT NULL,
        rm integer,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, measured_on, item)
      );
    `,
  },
  {
    id: "003_training_programs_and_plan",
    // メニューを期間ごとに何本も持てるようにする(キーは最初の週の開始日)。年間の方針は1つ。
    sql: `
      CREATE TABLE training_programs (
        team_slug text NOT NULL,
        start_date text NOT NULL,
        data jsonb NOT NULL,
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, start_date)
      );

      INSERT INTO training_programs (team_slug, start_date, data, updated_by, updated_at)
      SELECT team_slug, data->'weeks'->0->>'s', data, updated_by, updated_at
      FROM training_menus
      WHERE data->'weeks'->0->>'s' IS NOT NULL;

      CREATE TABLE training_plans (
        team_slug text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "004_notes",
    // バレーノート:1人・1練習日に1つ。書いたときのポジションとまとまりも残す(あとで転向しても、当時の振り分けのまま読める)。
    sql: `
      CREATE TABLE notes (
        id text PRIMARY KEY,
        team_slug text NOT NULL,
        member_id text NOT NULL REFERENCES members (id),
        practice_date text NOT NULL,
        position text,
        group_key text,
        body text NOT NULL,
        request text NOT NULL DEFAULT '',
        author_seen_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (member_id, practice_date)
      );
      CREATE INDEX notes_team_date ON notes (team_slug, practice_date DESC);

      CREATE TABLE note_comments (
        id text PRIMARY KEY,
        note_id text NOT NULL REFERENCES notes (id),
        member_id text NOT NULL REFERENCES members (id),
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX note_comments_note ON note_comments (note_id, created_at);

      CREATE TABLE practice_day_overrides (
        team_slug text NOT NULL,
        practice_date text NOT NULL,
        kind text NOT NULL,
        PRIMARY KEY (team_slug, practice_date)
      );
    `,
  },
  {
    id: "005_attendance",
    // 遅刻・早退・欠席の連絡。1人・1日に1つ(出し直すと上書き)。時刻は 'HH:MM' の文字で持つ。
    sql: `
      CREATE TABLE attendance_reports (
        id text PRIMARY KEY,
        team_slug text NOT NULL,
        member_id text NOT NULL REFERENCES members (id),
        practice_date text NOT NULL,
        kind text NOT NULL,
        arrive_at text,
        leave_at text,
        reason text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (member_id, practice_date)
      );
      CREATE INDEX attendance_reports_team_date ON attendance_reports (team_slug, practice_date);
    `,
  },
  {
    id: "006_member_number",
    // 背番号。名前の前に付けて出す(15林)。スタッフなど、番号のない人は空。
    sql: `
      ALTER TABLE members ADD COLUMN number integer
    `,
  },
  {
    id: "007_member_number_text",
    // スタッフは、背番号のところに T・M・C などの文字を使うので、数字ではなく文字で持つ。
    sql: `
      ALTER TABLE members ALTER COLUMN number TYPE text USING number::text
    `,
  },
  {
    id: "008_member_system_admin",
    // システム担当(名簿・ログインの記録・Slack のテスト)。役割とは別の印にして、トレーニング担当と兼ねられるようにする。
    // これまで名簿を変えられたのはトレーニング担当なので、その人をそのままシステム担当にする(名簿を触れる人がいなくならないように)。
    sql: `
      ALTER TABLE members ADD COLUMN is_system_admin boolean NOT NULL DEFAULT false;
      UPDATE members SET is_system_admin = true WHERE role = 'training_lead' AND active
    `,
  },
  {
    id: "009_member_slot_abc",
    // 枠を A・B・C にした(A と B は同じメニュー、C は別)。これまでの B(練習の後)は、いまの C にあたる。
    sql: `
      UPDATE members SET slot = 'C' WHERE slot = 'B'
    `,
  },
  {
    id: "010_member_training_lead_flag",
    // 役割を「部員/スタッフ」だけにし、トレーニング担当はチェックの印にした。トレーニング副担当はなくした。
    // 担当・副担当だった人は、ポジションがあれば部員、なければスタッフにする。
    sql: `
      ALTER TABLE members ADD COLUMN is_training_lead boolean NOT NULL DEFAULT false;
      UPDATE members SET is_training_lead = true WHERE role = 'training_lead';
      UPDATE members SET role = CASE WHEN position IS NULL THEN 'staff' ELSE 'member' END
        WHERE role IN ('training_lead', 'training_sub')
    `,
  },
  {
    id: "011_training_request_replies",
    // トレーニング録の「トレーニング担当へ」への返信。member_id・week_start・day で、どの日の記録かを決める。
    sql: `
      CREATE TABLE training_request_replies (
        id text PRIMARY KEY,
        member_id text NOT NULL REFERENCES members (id),
        week_start text NOT NULL,
        day text NOT NULL,
        author_id text NOT NULL REFERENCES members (id),
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX training_request_replies_week ON training_request_replies (week_start)
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
