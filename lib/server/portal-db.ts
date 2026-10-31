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
  {
    id: "012_portal_texts",
    // ホームに出すチームの目標など、部内ページの文章。key ごとに1つ(今は goal だけ)。
    sql: `
      CREATE TABLE portal_texts (
        team_slug text NOT NULL,
        key text NOT NULL,
        body text NOT NULL,
        updated_by text REFERENCES members (id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, key)
      )
    `,
  },
  {
    id: "013_training_sessions",
    // トレーニング録を「日付ごと」にする(部員の声、2026-10-20)。1人・1日に1つ。
    // exercises は [{ name, lift, sets: [{ kg, reps }] }]。セットごとに重さ・回数を変えられる。
    // これまでの記録(週・曜日ごと、種目に重さ1つ)は日付に直して移す。週の始まりは月曜で、
    // 火 +1・木 +3・土 +5、自主は日曜(+6)に置く。回数は残っていないので空にする。古い表は消さずに残す。
    // 「トレーニング担当へ」への返信も、記録の日付で結びつける(session_date)。
    sql: `
      CREATE TABLE training_sessions (
        member_id text NOT NULL REFERENCES members (id),
        date text NOT NULL,
        exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
        body_weight_kg double precision,
        memo text NOT NULL DEFAULT '',
        request text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, date)
      );
      CREATE INDEX training_sessions_date ON training_sessions (date);

      INSERT INTO training_sessions (member_id, date, exercises, memo, request, updated_at)
      SELECT keys.member_id,
        to_char(keys.week_start::date + CASE keys.day WHEN 'tue' THEN 1 WHEN 'thu' THEN 3 WHEN 'sat' THEN 5 ELSE 6 END, 'YYYY-MM-DD'),
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', l.exercise, 'lift', l.lift,
            'sets', jsonb_build_array(jsonb_build_object('kg', l.weight_kg, 'reps', NULL))
          ) ORDER BY l.exercise)
          FROM training_logs l
          WHERE l.member_id = keys.member_id AND l.week_start = keys.week_start AND l.day = keys.day
        ), '[]'::jsonb),
        COALESCE(mm.memo, ''),
        COALESCE(mm.request, ''),
        COALESCE(mm.updated_at, now())
      FROM (
        SELECT member_id, week_start, day FROM training_logs
        UNION
        SELECT member_id, week_start, day FROM training_memos
      ) keys
      LEFT JOIN training_memos mm
        ON mm.member_id = keys.member_id AND mm.week_start = keys.week_start AND mm.day = keys.day
      ON CONFLICT (member_id, date) DO NOTHING;

      ALTER TABLE training_request_replies ADD COLUMN session_date text;
      UPDATE training_request_replies SET session_date = to_char(
        week_start::date + CASE day WHEN 'tue' THEN 1 WHEN 'thu' THEN 3 WHEN 'sat' THEN 5 ELSE 6 END, 'YYYY-MM-DD');
      CREATE INDEX training_request_replies_session ON training_request_replies (member_id, session_date)
    `,
  },
  {
    id: "014_member_executive",
    // 幹部の印。ホームの目標と、データベース/マニュアルを書き直せる。
    sql: `ALTER TABLE members ADD COLUMN is_executive boolean NOT NULL DEFAULT false`,
  },
  {
    id: "015_comment_duties",
    // コメント当番。週(月曜)ごとの組み合わせを、その週に初めて開かれたときに作って残す(週の途中で名簿が変わっても、組は変えない)。
    // comment_duty_weeks は「この週の組はもう作った」の印。先に印を立てた1回だけが組を書き込む。
    sql: `
      CREATE TABLE comment_duty_weeks (
        team_slug text NOT NULL,
        week_start text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, week_start)
      );
      CREATE TABLE comment_duties (
        team_slug text NOT NULL,
        week_start text NOT NULL,
        commenter_id text NOT NULL REFERENCES members (id),
        target_id text NOT NULL REFERENCES members (id),
        PRIMARY KEY (team_slug, week_start, commenter_id)
      );
      CREATE INDEX comment_duties_target ON comment_duties (team_slug, week_start, target_id)
    `,
  },
  {
    id: "016_member_passphrase",
    // 1人ずつの合言葉(2026-10-25 から)。部の合言葉に加えて、決めた人はログインで自分の合言葉も聞かれる。
    // passphrase_version は、決め直す・消すたびに1つ増やす。クッキーの番号と違えば、その人の前のログインは無効。
    sql: `
      ALTER TABLE members ADD COLUMN passphrase_hash text;
      ALTER TABLE members ADD COLUMN passphrase_version integer NOT NULL DEFAULT 0
    `,
  },
  {
    id: "017_training_must_items",
    // 「これだけは欠かさないでほしい種目」の星(2026-10-25 から)。種目の名前ごとに付ける(週・曜日・期間をまたいで同じ)。
    sql: `
      CREATE TABLE training_must_items (
        team_slug text NOT NULL,
        name text NOT NULL,
        marked_by text REFERENCES members (id),
        marked_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, name)
      )
    `,
  },
  {
    id: "018_personal_menu_items",
    // 個人の追加メニュー(2026-10-26 から)。面談で決めた種目を、トレーニング担当がその人だけに足す。
    // days は曜日のキー(tue・thu・sat・self)をカンマでつないだもの。
    sql: `
      CREATE TABLE personal_menu_items (
        id text PRIMARY KEY,
        team_slug text NOT NULL,
        member_id text NOT NULL REFERENCES members (id),
        name text NOT NULL,
        dose text NOT NULL DEFAULT '',
        tip text NOT NULL DEFAULT '',
        days text NOT NULL,
        weighted boolean NOT NULL DEFAULT false,
        created_by text REFERENCES members (id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX personal_menu_items_member ON personal_menu_items (team_slug, member_id, created_at)
    `,
  },
  {
    id: "019_note_team_message",
    // ノートの「チームへ」の欄(2026-10-26 から)。チーム全体への振り返り。ノートのページの「チームへ」に全員分まとめて出す。
    sql: `ALTER TABLE notes ADD COLUMN team_message text NOT NULL DEFAULT ''`,
  },
  {
    id: "020_share_links",
    // ログインしない人(監督など)に見せる共有リンク(2026-10-31 から)。種類(今は schedule だけ)ごとに1つ。
    // 作り直すと token が変わり、古いリンクは開けなくなる。止めると行を消す。
    sql: `
      CREATE TABLE share_links (
        team_slug text NOT NULL,
        kind text NOT NULL,
        token text NOT NULL UNIQUE,
        created_by text REFERENCES members (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, kind)
      )
    `,
  },
  {
    id: "021_monthly_milestones",
    // 月間マイルストーン(2026-10-31 から)。個人(monthly_milestones)は1人・1か月に1つ、チーム(team_monthly_milestones)は
    // 1か月に1つで幹部が決める。どちらもその月のうちは書き直せ、過去の月は記録として残す。
    // month は 'YYYY-MM'(日本時間)。
    sql: `
      CREATE TABLE monthly_milestones (
        team_slug text NOT NULL,
        member_id text NOT NULL REFERENCES members (id),
        month text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (member_id, month)
      );
      CREATE INDEX monthly_milestones_team_month ON monthly_milestones (team_slug, month);

      CREATE TABLE team_monthly_milestones (
        team_slug text NOT NULL,
        month text NOT NULL,
        body text NOT NULL,
        updated_by text REFERENCES members (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_slug, month)
      )
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
