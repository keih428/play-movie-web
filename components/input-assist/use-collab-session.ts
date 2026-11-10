"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_MS,
  SYNC_POLL_MS,
  isHeldByOther,
  type IaAssignment,
  type IaPassSeconds,
  type InputAssistBundle,
  type InputAssistSyncState,
} from "@/lib/domain/input-assist/board";
import {
  IA_STORAGE_VERSION,
  composeSession,
  emptySliceData,
  mergeSliceData,
  metaOf,
  parseSliceKey,
  sliceKey,
  splitSession,
  stableStringify,
  type IaSliceData,
  type IaSliceRecord,
  type InputAssistMeta,
  type MergePreference,
} from "@/lib/domain/input-assist/collab";
import type { IaPassName, InputAssistSession } from "@/lib/domain/input-assist/types";
import { buildTeamApiPath } from "@/lib/domain/team";

// 共同編集の土台。セッションを「メタ + セット × パスのスライス」として保存し、4 秒ごとにほかの人の保存と担当を見る。
//
// - 手元の編集は今までどおりセッションまるごとを変える(edit)。保存するときに分けて、変わったスライスだけを送る
// - スライスごとに「サーバーの版と中身(server)」と「サーバーの中身を、この画面で組み立てたときの形(local)」を持つ。
//   今の形が local と違えば、手元で編集した(保存待ち)
// - 保存で 409(ほかの人が先に保存)なら、id ごとに3方向で合わせて保存し直す。自分が打っているスライスは自分の編集を、
//   それ以外(流れが変わって評価を消したなど、ついでに変えたもの)はほかの人の編集を取る
// - ほかの人の保存は、自分が打っているスライス(今のセット × パス)には入れない(知らせて、読み込むかを選ぶ)。それ以外は入れる

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

type SliceState = {
  version: number;
  data: IaSliceData;
  /** サーバーの中身を、この画面で組み立てたときの形(stableStringify)。 */
  local: string;
  updatedByName: string | null;
};

type CurrentMember = { id: string; name: string };

/** ほかの人が、今打っているスライスを保存した。hidden = 「あとで」を押した(同じ版では、もう出さない)。 */
export type RemoteNotice = { key: string; record: IaSliceRecord; hidden?: boolean };
export type TakeoverNotice = { setIndex: number; pass: IaPassName; holderName: string; lost: boolean };

const SAVE_DELAY_MS = 1200;
const EMPTY_JSON: Record<IaPassName, string> = {
  P0: stableStringify(emptySliceData("P0")),
  P1: stableStringify(emptySliceData("P1")),
  P2: stableStringify(emptySliceData("P2")),
  P3: stableStringify(emptySliceData("P3")),
  P4: stableStringify(emptySliceData("P4")),
};

function passOfKey(key: string): IaPassName {
  return parseSliceKey(key)?.pass ?? "P0";
}

function metaJson(meta: InputAssistMeta): string {
  return stableStringify({ ...meta, updatedAt: undefined });
}

function sliceMapOf(records: IaSliceRecord[]): Record<string, IaSliceData> {
  return Object.fromEntries(records.map((record) => [sliceKey(record.setIndex, record.pass), record.data]));
}

export function useCollabSession({
  initialBundle,
  teamSlug,
  member,
  activeKey,
  autoClaim,
}: {
  initialBundle: InputAssistBundle;
  teamSlug: string;
  member: CurrentMember;
  /** 今打っているスライス("1-P1" など)。準備のタブなら null。 */
  activeKey: string | null;
  /** 開いたパスを、だれも担当していなければ自分の担当にするか。 */
  autoClaim: boolean;
}) {
  const [session, setSessionState] = useState<InputAssistSession>(() =>
    composeSession(initialBundle.meta, sliceMapOf(initialBundle.slices)),
  );
  const sessionRef = useRef(session);
  const slicesRef = useRef<Map<string, SliceState> | null>(null);
  if (slicesRef.current === null) {
    const composed = splitSession(sessionRef.current).slices;
    slicesRef.current = new Map(
      initialBundle.slices.map((record) => {
        const key = sliceKey(record.setIndex, record.pass);
        return [
          key,
          {
            version: record.version,
            data: record.data,
            local: stableStringify(composed[key] ?? emptySliceData(record.pass)),
            updatedByName: record.updatedByName,
          },
        ];
      }),
    );
  }
  const metaLocalRef = useRef(metaJson(initialBundle.meta));
  const metaUpdatedAtRef = useRef(initialBundle.meta.updatedAt);
  const activeKeyRef = useRef(activeKey);
  const savingRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  const [editVersion, setEditVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [metaConflict, setMetaConflictState] = useState<InputAssistMeta | null>(null);
  const metaConflictRef = useRef<InputAssistMeta | null>(null);
  const setMetaConflict = useCallback((meta: InputAssistMeta | null) => {
    metaConflictRef.current = meta;
    setMetaConflictState(meta);
  }, []);
  const [remoteNotice, setRemoteNotice] = useState<RemoteNotice | null>(null);
  const [mergeNotice, setMergeNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [assignments, setAssignments] = useState<IaAssignment[]>(initialBundle.assignments);
  const assignmentsRef = useRef(assignments);
  const [passSeconds, setPassSeconds] = useState<IaPassSeconds[]>(initialBundle.passSeconds);
  const [takeover, setTakeover] = useState<TakeoverNotice | null>(null);

  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);
  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

  const commit = useCallback((next: InputAssistSession) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  // ---- 編集 ----

  /** セッションを変える(手元)。保存は少し待ってから、変わったスライスだけ。 */
  const edit = useCallback(
    (change: (current: InputAssistSession) => InputAssistSession) => {
      const next = change(sessionRef.current);
      if (next === sessionRef.current) {
        return;
      }
      commit(next);
      lastActivityRef.current = Date.now();
      setEditVersion((version) => version + 1);
      setSaveState("dirty");
    },
    [commit],
  );

  const dirtyKeys = useCallback((current: InputAssistSession) => {
    const { slices } = splitSession(current);
    const keys: string[] = [];
    for (const [key, data] of Object.entries(slices)) {
      const state = slicesRef.current?.get(key);
      if (stableStringify(data) !== (state?.local ?? EMPTY_JSON[passOfKey(key)])) {
        keys.push(key);
      }
    }
    return { keys, slices };
  }, []);

  const hasUnsaved = useCallback(() => {
    const current = sessionRef.current;
    return dirtyKeys(current).keys.length > 0 || metaJson(metaOf(current)) !== metaLocalRef.current;
  }, [dirtyKeys]);

  /** 保存するものがあるか(メタがぶつかっている間は、メタは保存しない)。 */
  const needsSave = useCallback(() => {
    const current = sessionRef.current;
    return (
      dirtyKeys(current).keys.length > 0 ||
      (!metaConflictRef.current && metaJson(metaOf(current)) !== metaLocalRef.current)
    );
  }, [dirtyKeys]);

  /**
   * サーバーのスライスを手元に入れる。手元で編集していたスライスは、3方向で合わせる(prefer の方を取る)。
   * 入れたスライスのせいで形が変わったほかのスライス(消えたラリーのタッチなど)は、編集したことにしない。
   */
  const integrate = useCallback(
    (records: IaSliceRecord[], prefer: (key: string) => MergePreference) => {
      const current = sessionRef.current;
      const before = splitSession(current);
      const dirtyBefore = new Set(dirtyKeys(current).keys);
      const slices = { ...before.slices };
      const theirsOnly = { ...before.slices };
      const updated: string[] = [];
      for (const record of records) {
        const key = sliceKey(record.setIndex, record.pass);
        const state = slicesRef.current?.get(key);
        if (state && record.version <= state.version) {
          continue;
        }
        slices[key] = dirtyBefore.has(key)
          ? mergeSliceData(record.pass, state?.data, before.slices[key], record.data, prefer(key))
          : record.data;
        theirsOnly[key] = record.data;
        slicesRef.current?.set(key, {
          version: record.version,
          data: record.data,
          local: "",
          updatedByName: record.updatedByName,
        });
        updated.push(key);
      }
      if (updated.length === 0) {
        return false;
      }
      const next = composeSession(before.meta, slices);
      const nextSplit = splitSession(next).slices;
      const theirsSplit = splitSession(composeSession(before.meta, theirsOnly)).slices;
      for (const key of Object.keys(nextSplit)) {
        const state = slicesRef.current?.get(key);
        const pass = passOfKey(key);
        if (!dirtyBefore.has(key)) {
          const local = stableStringify(nextSplit[key]);
          if (state) {
            state.local = local;
          } else {
            slicesRef.current?.set(key, { version: 0, data: emptySliceData(pass), local, updatedByName: null });
          }
        } else if (updated.includes(key) && state) {
          state.local = stableStringify(theirsSplit[key]);
        }
      }
      commit(next);
      return true;
    },
    [commit, dirtyKeys],
  );

  // ---- 保存 ----

  const saveMeta = useCallback(
    async (current: InputAssistSession, overwrite: boolean) => {
      const meta = metaOf(current);
      const json = metaJson(meta);
      if (!overwrite && (json === metaLocalRef.current || metaConflictRef.current)) {
        return !metaConflictRef.current;
      }
      const response = await fetch(buildTeamApiPath(`/api/input-assist/sessions/${current.id}`, teamSlug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageVersion: IA_STORAGE_VERSION,
          expectedUpdatedAt: overwrite ? undefined : metaUpdatedAtRef.current,
          title: meta.title,
          date: meta.date,
          opponent: meta.opponent,
          videoPath: meta.videoPath ?? "",
          teams: meta.teams,
          extras: meta.extras,
          sets: meta.sets,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { meta?: InputAssistMeta; error?: string; reload?: boolean }
        | null;
      if (response.status === 409 && payload?.meta) {
        setMetaConflict(payload.meta);
        return false;
      }
      if (!response.ok || !payload?.meta) {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      metaLocalRef.current = json;
      metaUpdatedAtRef.current = payload.meta.updatedAt;
      const savedAt = payload.meta.updatedAt;
      commit({ ...sessionRef.current, updatedAt: savedAt });
      setMetaConflict(null);
      return true;
    },
    [commit, setMetaConflict, teamSlug],
  );

  const saveSlice = useCallback(
    async (sessionId: string, key: string, data: IaSliceData) => {
      const parsed = parseSliceKey(key);
      if (!parsed) {
        return "ok" as const;
      }
      const state = slicesRef.current?.get(key);
      const response = await fetch(
        buildTeamApiPath(`/api/input-assist/sessions/${sessionId}/slices/${parsed.setIndex}/${parsed.pass}`, teamSlug),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: state?.version ?? 0, data }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { slice?: IaSliceRecord; error?: string } | null;
      if (response.status === 409 && payload?.slice) {
        // ほかの人が先に保存した:合わせて、もう一度保存する
        const record = payload.slice;
        integrate([record], (target) => (target === activeKeyRef.current ? "mine" : "theirs"));
        if (key === activeKeyRef.current) {
          setRemoteNotice(null);
          setMergeNotice(
            `${record.updatedByName ?? "ほかの人"}さんの保存と合わせました(同じところは、この画面の編集を残しました)。`,
          );
        }
        return "merged" as const;
      }
      if (!response.ok || !payload?.slice) {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      const saved = payload.slice;
      slicesRef.current?.set(key, {
        version: saved.version,
        data: saved.data,
        local: stableStringify(data),
        updatedByName: saved.updatedByName,
      });
      if (key === activeKeyRef.current) {
        setRemoteNotice((notice) => (notice && notice.key === key && notice.record.version <= saved.version ? null : notice));
      }
      return "ok" as const;
    },
    [integrate, teamSlug],
  );

  const save = useCallback(
    async (overwriteMeta = false) => {
      if (savingRef.current) {
        return;
      }
      savingRef.current = true;
      setSaveState("saving");
      let again = false;
      try {
        const current = sessionRef.current;
        const metaOk = await saveMeta(current, overwriteMeta);
        const { keys, slices } = dirtyKeys(current);
        // 今打っているスライスを先に
        keys.sort((left, right) => Number(right === activeKeyRef.current) - Number(left === activeKeyRef.current));
        for (const key of keys) {
          const result = await saveSlice(current.id, key, slices[key]);
          if (result === "merged") {
            again = true;
          }
        }
        setErrorMessage("");
        setSaveState(!metaOk ? "conflict" : hasUnsaved() ? "dirty" : "saved");
        if (needsSave()) {
          again = true;
        }
      } catch (error) {
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "保存できませんでした。");
      } finally {
        savingRef.current = false;
      }
      if (again) {
        setEditVersion((version) => version + 1);
      }
    },
    [dirtyKeys, hasUnsaved, needsSave, saveMeta, saveSlice],
  );

  useEffect(() => {
    if (editVersion === 0 || saveState === "saving" || !needsSave()) {
      return;
    }
    const timer = window.setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editVersion, saveState, save, needsSave]);

  // 保存できなかったときは、少し待って保存し直す
  useEffect(() => {
    if (saveState !== "error") {
      return;
    }
    const timer = window.setTimeout(() => setEditVersion((version) => version + 1), 5000);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsaved()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  /** 今すぐ保存する(AI に頼む・試合ビューアに保存する前に)。保存し終えたら true。 */
  const saveNow = useCallback(async () => {
    for (let index = 0; index < 40 && savingRef.current; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (needsSave()) {
      await save();
    }
    return !needsSave() && !metaConflictRef.current;
  }, [needsSave, save]);

  /** サーバーが新しくしたメタ(試合ビューアに保存したときなど)を入れる。手元でメタを編集していれば、入れない(4 秒ごとに見たときに知らせる)。 */
  const acceptMeta = useCallback(
    (meta: InputAssistMeta) => {
      const current = sessionRef.current;
      if (metaJson(metaOf(current)) !== metaLocalRef.current || meta.updatedAt === metaUpdatedAtRef.current) {
        return;
      }
      const { slices } = splitSession(current);
      metaLocalRef.current = metaJson(meta);
      metaUpdatedAtRef.current = meta.updatedAt;
      commit(composeSession(meta, slices));
    },
    [commit],
  );

  /** メタがぶつかったとき:サーバーの方を読み込む。 */
  const reloadMeta = useCallback(() => {
    if (!metaConflict) {
      return;
    }
    const { slices } = splitSession(sessionRef.current);
    metaLocalRef.current = metaJson(metaConflict);
    metaUpdatedAtRef.current = metaConflict.updatedAt;
    commit(composeSession(metaConflict, slices));
    setMetaConflict(null);
    setSaveState(hasUnsaved() ? "dirty" : "saved");
    setEditVersion((version) => version + 1);
  }, [commit, hasUnsaved, metaConflict, setMetaConflict]);

  /** メタがぶつかったとき:この画面の内容で保存する。 */
  const overwriteMeta = useCallback(() => {
    setMetaConflict(null);
    setSaveState("dirty");
    void save(true);
  }, [save, setMetaConflict]);

  /** ほかの人が、今打っているスライスを保存したとき:読み込む(この画面の保存していない編集は残す)。 */
  const acceptRemote = useCallback(() => {
    if (!remoteNotice) {
      return;
    }
    integrate([remoteNotice.record], () => "mine");
    setRemoteNotice(null);
    setEditVersion((version) => version + 1);
  }, [integrate, remoteNotice]);

  // ---- 4 秒ごとに見る ----

  const pendingRemoteRef = useRef<RemoteNotice | null>(null);
  useEffect(() => {
    pendingRemoteRef.current = remoteNotice;
  }, [remoteNotice]);

  useEffect(() => {
    let stopped = false;
    let running = false;
    const tick = async () => {
      if (stopped || running || savingRef.current || document.visibilityState !== "visible") {
        return;
      }
      running = true;
      try {
        const known = [...(slicesRef.current ?? new Map<string, SliceState>()).entries()]
          .map(([key, state]) => {
            const pending = pendingRemoteRef.current;
            const version = pending && pending.key === key ? Math.max(pending.record.version, state.version) : state.version;
            return `${key}:${version}`;
          })
          .join(",");
        const params = new URLSearchParams({ known, meta: metaUpdatedAtRef.current });
        const response = await fetch(
          `${buildTeamApiPath(`/api/input-assist/sessions/${sessionRef.current.id}/sync`, teamSlug)}&${params.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok || stopped || savingRef.current) {
          return;
        }
        const state = (await response.json()) as InputAssistSyncState;
        // 変わったときだけ入れる(4 秒ごとに画面を描き直さないように)
        setAssignments((previous) => (stableStringify(previous) === stableStringify(state.assignments) ? previous : state.assignments));
        setPassSeconds((previous) => (stableStringify(previous) === stableStringify(state.passSeconds) ? previous : state.passSeconds));

        const active = activeKeyRef.current;
        const others = state.changed.filter((record) => sliceKey(record.setIndex, record.pass) !== active);
        const mine = state.changed.find((record) => sliceKey(record.setIndex, record.pass) === active);
        if (others.length > 0) {
          integrate(others, () => "theirs");
        }
        if (mine && active) {
          const current = slicesRef.current?.get(active);
          if (!current || mine.version > current.version) {
            // 中身がこの画面と同じなら、黙って版だけ進める
            const sameAsHere = stableStringify(splitSession(sessionRef.current).slices[active]) === stableStringify(mine.data);
            const pending = pendingRemoteRef.current;
            if (sameAsHere) {
              integrate([mine], () => "mine");
            } else if (!pending || pending.key !== active || mine.version > pending.record.version) {
              setRemoteNotice({ key: active, record: mine });
            }
          }
        }
        if (state.meta && state.meta.updatedAt !== metaUpdatedAtRef.current) {
          const current = sessionRef.current;
          if (metaJson(metaOf(current)) === metaLocalRef.current) {
            const { slices } = splitSession(current);
            metaLocalRef.current = metaJson(state.meta);
            metaUpdatedAtRef.current = state.meta.updatedAt;
            commit(composeSession(state.meta, slices));
          } else {
            setMetaConflict(state.meta);
            setSaveState("conflict");
          }
        }
      } catch {
        // 次の回にまた見る
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void tick(), SYNC_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [commit, integrate, setMetaConflict, teamSlug]);

  // 今打っているスライスが変わったら、前の知らせは消す
  useEffect(() => {
    setRemoteNotice((notice) => (notice && notice.key !== activeKey ? null : notice));
    setMergeNotice("");
  }, [activeKey]);

  // ---- 担当 ----

  const assign = useCallback(
    async (action: "claim" | "heartbeat" | "release" | "done" | "reopen", setIndex: number, pass: IaPassName, force = false) => {
      try {
        const response = await fetch(
          buildTeamApiPath(`/api/input-assist/sessions/${sessionRef.current.id}/assignments`, teamSlug),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, setIndex, pass, force }),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; assignments?: IaAssignment[]; error?: string }
          | null;
        if (!response.ok || !payload?.assignments) {
          setErrorMessage(payload?.error ?? "担当を変えられませんでした。");
          return false;
        }
        setAssignments(payload.assignments);
        assignmentsRef.current = payload.assignments;
        if (!payload.ok && (action === "claim" || action === "heartbeat")) {
          const holder = payload.assignments.find((entry) => entry.setIndex === setIndex && entry.pass === pass);
          setTakeover({
            setIndex,
            pass,
            holderName: holder?.holderName ?? "ほかの人",
            lost: action === "heartbeat",
          });
        } else if (action === "claim" || action === "release" || action === "done") {
          setTakeover((notice) => (notice && notice.setIndex === setIndex && notice.pass === pass ? null : notice));
        }
        return Boolean(payload.ok);
      } catch {
        setErrorMessage("担当を変えられませんでした。通信を確かめてください。");
        return false;
      }
    },
    [teamSlug],
  );

  // パスのタブを開いたら、だれも担当していなければ自分が担当する(完了のマスは、そのまま)
  useEffect(() => {
    const parsed = activeKey && autoClaim ? parseSliceKey(activeKey) : null;
    if (!parsed) {
      return;
    }
    const assignment = assignmentsRef.current.find(
      (entry) => entry.setIndex === parsed.setIndex && entry.pass === parsed.pass,
    );
    if (assignment?.done || assignment?.holderId === member.id) {
      return;
    }
    if (isHeldByOther(assignment, member.id, Date.now())) {
      setTakeover({ setIndex: parsed.setIndex, pass: parsed.pass, holderName: assignment?.holderName ?? "ほかの人", lost: false });
      return;
    }
    void assign("claim", parsed.setIndex, parsed.pass);
  }, [activeKey, assign, autoClaim, member.id]);

  // 開いている間は、20 秒ごとに「まだいる」を送る(2 分なにもしていなければ送らない = 止まっているとみなされる)
  useEffect(() => {
    const parsed = activeKey ? parseSliceKey(activeKey) : null;
    if (!parsed) {
      return;
    }
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("keydown", mark);
    window.addEventListener("pointerdown", mark);
    const timer = window.setInterval(() => {
      const holder = assignmentsRef.current.find(
        (entry) => entry.setIndex === parsed.setIndex && entry.pass === parsed.pass,
      );
      if (
        holder?.holderId === member.id &&
        document.visibilityState === "visible" &&
        Date.now() - lastActivityRef.current < PRESENCE_STALE_MS
      ) {
        void assign("heartbeat", parsed.setIndex, parsed.pass);
      }
    }, PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("pointerdown", mark);
    };
  }, [activeKey, assign, member.id]);

  /** 動画が進んだなど、キー・クリック以外で作業しているとき。 */
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  /** パスの時間を送ったあと、手元の合計にも足す(次に見たときにサーバーの合計で置き換わる)。 */
  const addPassSeconds = useCallback((entry: IaPassSeconds) => {
    setPassSeconds((list) => [...list, entry]);
  }, []);

  return {
    session,
    sessionRef,
    edit,
    saveState,
    errorMessage,
    metaConflict,
    reloadMeta,
    overwriteMeta,
    saveNow,
    acceptMeta,
    remoteNotice,
    acceptRemote,
    dismissRemote: () => setRemoteNotice((notice) => (notice ? { ...notice, hidden: true } : notice)),
    mergeNotice,
    clearMergeNotice: () => setMergeNotice(""),
    assignments,
    passSeconds,
    addPassSeconds,
    assign,
    takeover,
    dismissTakeover: () => setTakeover(null),
    markActivity,
  };
}
