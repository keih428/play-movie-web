"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IaAiJobPanel, IaAiJobStatusLine, useAiJobs } from "@/components/input-assist/ia-ai-jobs";
import { IaAssignmentBoard } from "@/components/input-assist/ia-assignment-board";
import { IaEffectPass } from "@/components/input-assist/ia-effect-pass";
import { IaFlowPass } from "@/components/input-assist/ia-flow-pass";
import { IaTypePass } from "@/components/input-assist/ia-type-pass";
import { IaZonePass } from "@/components/input-assist/ia-zone-pass";
import { formatClock, formatDuration, isTypingTarget } from "@/components/input-assist/ia-utils";
import { IaPlayer, type IaPlayerHandle } from "@/components/input-assist/ia-player";
import { IaRateButtons } from "@/components/input-assist/ia-rate-buttons";
import { IaSetupEditor, type IaSetupValue } from "@/components/input-assist/ia-setup-editor";
import { useCollabSession, type SaveState } from "@/components/input-assist/use-collab-session";
import { usePassTimer, type PassTimerFlush } from "@/components/input-assist/use-pass-timer";
import { usePlaybackRate } from "@/components/input-assist/use-playback-rate";
import { PASS_LABELS, type InputAssistBundle } from "@/lib/domain/input-assist/board";
import { skeletonRalliesForSet, type IaAiJobSummary } from "@/lib/domain/input-assist/ai-job";
import { sliceKey, type IaP0Data, type InputAssistMeta } from "@/lib/domain/input-assist/collab";
import { computeSet, formatRotation, servingTeamOf, sortRallies } from "@/lib/domain/input-assist/engine";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import {
  checkSets,
  createRally,
  getRallyWindow,
  isLowConfidence,
  roundTime,
  type IaSetCheck,
} from "@/lib/domain/input-assist/session";
import { applyAutoEffectsToSet, effectProgress } from "@/lib/domain/input-assist/effect";
import { flowProgress } from "@/lib/domain/input-assist/flow";
import { applyZoneChainToSet, zoneProgress } from "@/lib/domain/input-assist/zone";
import { applyAutoTypesToSet, buildTypeHistory, typeProgress } from "@/lib/domain/input-assist/type";
import { applySkeleton, parseSkeleton } from "@/lib/domain/input-assist/skeleton";
import type {
  IaCourtSide,
  IaPassName,
  IaRally,
  IaSet,
  IaTeamSide,
  InputAssistSession,
} from "@/lib/domain/input-assist/types";
import { buildVsmFileName, buildVsmText } from "@/lib/domain/input-assist/vsm-writer";
import { buildTeamApiPath, buildWorkspacePath } from "@/lib/domain/team";

type Tab = "setup" | "p0" | "p1" | "p2" | "p3" | "p4";

type InputAssistSessionClientProps = {
  initialBundle: InputAssistBundle;
  currentMember: { id: string; name: string };
  teamSlug: string;
  listHref: string;
};

const NUDGE_SECONDS = 0.5;
/** 通して流しているときに ← → で動かす秒数。 */
const SEEK_SECONDS = 5;

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "保存済み",
  dirty: "保存待ち",
  saving: "保存中…",
  error: "保存できませんでした",
  conflict: "ほかの画面と重なりました",
};

const TAB_OF_PASS: Record<IaPassName, Tab> = { P0: "p0", P1: "p1", P2: "p2", P3: "p3", P4: "p4" };
const PASS_OF_TAB: Partial<Record<Tab, IaPassName>> = { p0: "P0", p1: "P1", p2: "P2", p3: "P3", p4: "P4" };

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function InputAssistSessionClient({
  initialBundle,
  currentMember,
  teamSlug,
  listHref,
}: InputAssistSessionClientProps) {
  // 最初に開くところ:自分が担当しているマス(止まっていないもの)があればそこ、なければラリーがあれば P0、なければ準備
  const [initialPlace] = useState(() => {
    const held = initialBundle.assignments
      .filter((entry) => entry.holderId === currentMember.id && !entry.done && entry.heartbeatAt)
      .sort((left, right) => (right.heartbeatAt ?? "").localeCompare(left.heartbeatAt ?? ""))[0];
    const firstSet = initialBundle.meta.sets.find((set) => !set.skipped)?.setIndex ?? 1;
    if (held && initialBundle.meta.sets.some((set) => set.setIndex === held.setIndex && !set.skipped)) {
      return { tab: TAB_OF_PASS[held.pass], setIndex: held.setIndex, resumed: true };
    }
    const hasRallies = initialBundle.slices.some(
      (record) => record.pass === "P0" && ((record.data as IaP0Data).rallies ?? []).length > 0,
    );
    return { tab: (hasRallies ? "p0" : "setup") as Tab, setIndex: firstSet, resumed: false };
  });
  const [tab, setTabState] = useState<Tab>(initialPlace.tab);
  const [setIndex, setSetIndex] = useState(initialPlace.setIndex);
  // 自分でタブかセットを選ぶまでは、開いただけで担当にはしない(P1 を打ちに来た人が、最初の P0 を取らないように)
  const [chosen, setChosen] = useState(initialPlace.resumed);
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    setChosen(true);
  }, []);
  const passName: IaPassName | null = PASS_OF_TAB[tab] ?? null;
  const activeKey = passName ? sliceKey(setIndex, passName) : null;

  const {
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
    dismissRemote,
    mergeNotice,
    clearMergeNotice,
    assignments,
    passSeconds: passSecondsList,
    addPassSeconds,
    assign,
    takeover,
    dismissTakeover,
    markActivity: markPresence,
  } = useCollabSession({
    initialBundle,
    teamSlug,
    member: currentMember,
    activeKey,
    autoClaim: chosen,
  });

  const [selectedRallyId, setSelectedRallyId] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [message, setMessage] = useState("");
  const [savingViewer, setSavingViewer] = useState(false);
  const aiJobs = useAiJobs(initialBundle.meta.id, teamSlug);

  const playerRef = useRef<IaPlayerHandle | null>(null);
  const { rate, changeRate } = usePlaybackRate(playerRef);
  const windowRef = useRef<{ rallyId: string; start: number; end: number; entered: boolean; startedAt: number } | null>(
    null,
  );
  const continuousRef = useRef(continuous);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  const activeSet: IaSet | undefined =
    session.sets.find((set) => set.setIndex === setIndex && !set.skipped) ?? session.sets.find((set) => !set.skipped);
  const activeSetIndex = activeSet?.setIndex;
  // 選んでいたセットが打たないセットになったなど:実際に開いているセットに合わせる(担当もそのセットにする)
  useEffect(() => {
    if (activeSetIndex !== undefined && activeSetIndex !== setIndex) {
      setSetIndex(activeSetIndex);
    }
  }, [activeSetIndex, setIndex]);

  const sortedRallies = useMemo(() => (activeSet ? sortRallies(activeSet.rallies) : []), [activeSet]);
  const setResult = useMemo(() => (activeSet ? computeSet(activeSet) : null), [activeSet]);
  const checks = useMemo(() => checkSets(session), [session]);
  const selectedRally = sortedRallies.find((rally) => rally.id === selectedRallyId);

  // ---- 編集 ----

  const editSet = useCallback(
    (targetSetIndex: number, change: (set: IaSet) => IaSet) =>
      edit((current) => {
        let changed = false;
        const sets = current.sets.map((set) => {
          if (set.setIndex !== targetSetIndex) {
            return set;
          }
          const next = change(set);
          changed ||= next !== set;
          return next;
        });
        return changed ? { ...current, sets } : current;
      }),
    [edit],
  );

  const editRally = useCallback(
    (rallyId: string, change: (rally: IaRally) => IaRally) =>
      editSet(setIndex, (set) => ({
        ...set,
        rallies: set.rallies.map((rally) => (rally.id === rallyId ? change(rally) : rally)),
      })),
    [editSet, setIndex],
  );

  const selectSet = useCallback((index: number) => {
    setSetIndex(index);
    setChosen(true);
    setSelectedRallyId(null);
    windowRef.current = null;
  }, []);

  // ---- パスの時間 ----

  const handlePassFlush = useCallback(
    (entry: PassTimerFlush) => {
      void fetch(buildTeamApiPath(`/api/input-assist/sessions/${sessionRef.current.id}/pass-logs`, teamSlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        keepalive: true,
      })
        .then((response) => {
          if (response.ok) {
            addPassSeconds({ setIndex: entry.setIndex, pass: entry.pass, seconds: entry.seconds });
          }
        })
        .catch(() => undefined);
    },
    [addPassSeconds, sessionRef, teamSlug],
  );

  // P0〜P4 は同じ仕組みで、開いているパスの時間を数える
  const timerPass = passName ?? "P0";
  const { pendingSeconds, markActivity: markTimer } = usePassTimer({
    active: tab !== "setup" && Boolean(activeSet),
    setIndex: activeSet?.setIndex ?? 1,
    pass: timerPass,
    onFlush: handlePassFlush,
  });
  const markActivity = useCallback(() => {
    markTimer();
    markPresence();
  }, [markPresence, markTimer]);
  const passSeconds =
    passSecondsList
      .filter((entry) => entry.pass === timerPass && entry.setIndex === activeSet?.setIndex)
      .reduce((total, entry) => total + entry.seconds, 0) + pendingSeconds;
  const progress = useMemo(() => flowProgress(session.sets), [session.sets]);
  const effectProgressList = useMemo(() => (tab === "p2" ? effectProgress(session.sets) : []), [session.sets, tab]);
  const zoneProgressList = useMemo(() => (tab === "p3" ? zoneProgress(session.sets) : []), [session.sets, tab]);
  // P4 のサーブの種類・ブロックの人数は、セッション(ほかのセットも)のこれまでから
  const typeHistory = useMemo(() => buildTypeHistory(session.sets), [session.sets]);
  const typeProgressList = useMemo(() => (tab === "p4" ? typeProgress(session.sets) : []), [session.sets, tab]);

  // P2・P3・P4 を開くとき(セットを替えたときも)、そのセットに、迷わない評価・ゾーン・種類を自動で入れて保存する
  // (P1 で流れが変わっていれば入れ直す)。ほかのセットはほかの人が打っているかもしれないので、触らない。
  useEffect(() => {
    if (activeSetIndex === undefined) {
      return;
    }
    if (tab === "p2") {
      editSet(activeSetIndex, applyAutoEffectsToSet);
    } else if (tab === "p3") {
      editSet(activeSetIndex, (set) => applyZoneChainToSet(set));
    } else if (tab === "p4") {
      edit((latest) => {
        const history = buildTypeHistory(latest.sets);
        let changed = false;
        const sets = latest.sets.map((set) => {
          if (set.setIndex !== activeSetIndex) {
            return set;
          }
          const next = applyAutoTypesToSet(set, { history });
          changed ||= next !== set;
          return next;
        });
        return changed ? { ...latest, sets } : latest;
      });
    }
  }, [activeSetIndex, edit, editSet, tab]);

  // ---- 動画とラリーの区間 ----

  const playRally = useCallback(
    (rallyId: string, rallies: IaRally[]) => {
      const range = getRallyWindow(rallies, rallyId);
      setSelectedRallyId(rallyId);
      if (!range) {
        return;
      }
      windowRef.current = { rallyId, ...range, entered: false, startedAt: Date.now() };
      playerRef.current?.playFrom(range.start);
    },
    [],
  );

  const moveBy = useCallback(
    (delta: number, fromRallyId?: string | null) => {
      const rallies = sortRallies(
        sessionRef.current.sets.find((set) => set.setIndex === setIndex)?.rallies ?? [],
      );
      if (rallies.length === 0) {
        return;
      }
      const index = rallies.findIndex((rally) => rally.id === (fromRallyId ?? selectedRallyId));
      const nextIndex = index === -1 ? 0 : index + delta;
      const next = rallies[nextIndex];
      if (!next) {
        windowRef.current = null;
        if (delta > 0 && continuousRef.current) {
          // 続けて流しているときは、最後のラリーのあとも止めずに流す(骨組みがなければ、I で足しながら進める)
          setMessage("このセットの最後のラリーです。このまま流すので、次のサーブで I を押してください。");
          return;
        }
        playerRef.current?.pause();
        setMessage(delta > 0 ? "このセットの最後のラリーです。" : "このセットの最初のラリーです。");
        return;
      }
      playRally(next.id, rallies);
    },
    [playRally, selectedRallyId, sessionRef, setIndex],
  );

  const handleTime = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      const range = windowRef.current;
      if (!range) {
        return;
      }
      markActivity();
      if (!range.entered) {
        // 前の位置の時刻が残っていることがあるので、区間に入ったのを見てから終わりを見る。
        if (seconds >= range.start - 0.5 && seconds < range.end) {
          range.entered = true;
        } else if (Date.now() - range.startedAt > 4000) {
          windowRef.current = null;
        }
        return;
      }
      if (seconds < range.start - 1.5) {
        windowRef.current = null;
        return;
      }
      if (seconds >= range.end) {
        if (continuousRef.current) {
          moveBy(1, range.rallyId);
        } else {
          windowRef.current = null;
          playerRef.current?.pause();
        }
      }
    },
    [markActivity, moveBy],
  );

  useEffect(() => {
    if (selectedRallyId) {
      rowRefs.current.get(selectedRallyId)?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedRallyId]);

  // ---- P0 の操作 ----

  const label = useCallback(
    (kind: IaCourtSide | "not_rally") => {
      if (!selectedRallyId) {
        moveBy(1);
        return;
      }
      editRally(selectedRallyId, (rally) =>
        kind === "not_rally"
          ? { ...rally, status: "not_rally", checked: true }
          : { ...rally, status: "rally", side: kind, checked: true },
      );
      const rallies = sortRallies(sessionRef.current.sets.find((set) => set.setIndex === setIndex)?.rallies ?? []);
      const isLast = rallies.at(-1)?.id === selectedRallyId;
      if (isLast && continuousRef.current) {
        // I で足したばかりのラリー(骨組みなしで打っているとき):動画は止めず、そのまま流す
        windowRef.current = null;
        return;
      }
      moveBy(1, selectedRallyId);
    },
    [editRally, moveBy, selectedRallyId, sessionRef, setIndex],
  );

  const insertRally = useCallback(() => {
    if (!activeSet) {
      return;
    }
    const time = playerRef.current?.getTime() ?? currentTime;
    const rally = createRally(time, { source: "manual" });
    editSet(activeSet.setIndex, (set) => ({ ...set, rallies: [...set.rallies, rally] }));
    windowRef.current = null;
    setSelectedRallyId(rally.id);
    setMessage(`${formatClock(rally.serveTime)} にラリーを足しました。N か F で向きを決めてください。`);
  }, [activeSet, currentTime, editSet]);

  const nudge = useCallback(
    (delta: number) => {
      if (!selectedRallyId || !activeSet) {
        return;
      }
      const rally = activeSet.rallies.find((entry) => entry.id === selectedRallyId);
      if (!rally) {
        return;
      }
      const serveTime = roundTime(rally.serveTime + delta);
      editRally(selectedRallyId, (entry) => ({ ...entry, serveTime }));
      const rallies = activeSet.rallies.map((entry) => (entry.id === selectedRallyId ? { ...entry, serveTime } : entry));
      playRally(selectedRallyId, rallies);
    },
    [activeSet, editRally, playRally, selectedRallyId],
  );

  const removeRally = useCallback(
    (rallyId: string) => {
      if (!window.confirm("このラリーを消しますか?")) {
        return;
      }
      editSet(setIndex, (set) => ({ ...set, rallies: set.rallies.filter((rally) => rally.id !== rallyId) }));
      if (selectedRallyId === rallyId) {
        setSelectedRallyId(null);
        windowRef.current = null;
      }
    },
    [editSet, selectedRallyId, setIndex],
  );

  /** 再生・一時停止(ラリーの区間は外して、そのまま流す)。 */
  const togglePlay = useCallback(() => {
    windowRef.current = null;
    playerRef.current?.togglePlay();
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      windowRef.current = null;
      playerRef.current?.seek((playerRef.current?.getTime() ?? currentTime) + delta);
    },
    [currentTime],
  );

  useEffect(() => {
    if (tab !== "p0") {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const noRallies = sortedRallies.length === 0;
      const actions: Record<string, () => void> = {
        n: () => label("near"),
        f: () => label("far"),
        x: () => label("not_rally"),
        " ": () => (selectedRallyId ? playRally(selectedRallyId, sortedRallies) : noRallies ? togglePlay() : moveBy(1)),
        k: togglePlay,
        ArrowLeft: () => (noRallies ? seekBy(-SEEK_SECONDS) : moveBy(-1)),
        ArrowRight: () => (noRallies ? seekBy(SEEK_SECONDS) : moveBy(1)),
        i: insertRally,
        ",": () => nudge(-NUDGE_SECONDS),
        ".": () => nudge(NUDGE_SECONDS),
      };
      const action = actions[key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [insertRally, label, moveBy, nudge, playRally, seekBy, selectedRallyId, sortedRallies, tab, togglePlay]);

  // ---- 骨組み・書き出し ----

  async function importSkeleton(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const skeleton = parseSkeleton(await file.text());
      const result = applySkeleton(session.sets, skeleton);
      const overwritten = result.replacedSets.filter(
        (index) => (session.sets.find((set) => set.setIndex === index)?.rallies.length ?? 0) > 0,
      );
      if (
        overwritten.length > 0 &&
        !window.confirm(`${overwritten.join("・")}セット目のラリーを、骨組みで入れ替えます。よいですか?`)
      ) {
        return;
      }
      edit((current) => ({ ...current, sets: result.sets }));
      setSetIndex(result.replacedSets[0] ?? setIndex);
      setSelectedRallyId(null);
      setTab("p0");
      setMessage(`骨組みを読み込みました(${result.rallyCount}本)。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "骨組みを読み込めませんでした。");
    }
  }

  /** AI の骨組みを、このセットに入れる(入っているラリーは入れ替える)。 */
  function applyAiSkeleton(job: IaAiJobSummary, targetSetIndex: number) {
    if (!job.skeleton) {
      return;
    }
    const target = session.sets.find((set) => set.setIndex === targetSetIndex);
    if (!target) {
      return;
    }
    if (
      target.rallies.length > 0 &&
      !window.confirm(
        `${targetSetIndex}セット目のラリー ${target.rallies.length} 本を、AI の骨組みで入れ替えます。P1〜P4 で入れたものも消えます。よいですか?`,
      )
    ) {
      return;
    }
    const rallies: IaRally[] = skeletonRalliesForSet(job.skeleton, targetSetIndex, job.id);
    editSet(targetSetIndex, (set) => ({ ...set, rallies }));
    setSelectedRallyId(null);
    setMessage(`${targetSetIndex}セット目に骨組みを入れました(${rallies.length}本)。`);
  }

  async function saveToMatchViewer() {
    setSavingViewer(true);
    setMessage("");
    try {
      if (!(await saveNow())) {
        setMessage("保存できていない編集があります。保存してから、もう一度押してください。");
        return;
      }
      const response = await fetch(buildTeamApiPath(`/api/input-assist/sessions/${session.id}/match-viewer`, teamSlug), {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { meta?: InputAssistMeta | null; created?: boolean; error?: string }
        | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "試合ビューアに保存できませんでした。");
        return;
      }
      if (payload?.meta) {
        acceptMeta(payload.meta);
      }
      setMessage(payload?.created ? "試合ビューアに保存しました。" : "試合ビューアの試合を新しくしました。");
    } catch {
      setMessage("試合ビューアに保存できませんでした。通信を確かめてください。");
    } finally {
      setSavingViewer(false);
    }
  }

  function exportVsm() {
    downloadText(buildVsmText(session), buildVsmFileName(session));
    const undecided = checks.reduce((total, check) => total + check.undecidedRallies, 0);
    setMessage(
      undecided > 0
        ? `書き出しました。向きの決まっていないラリー ${undecided} 本は入れていません。`
        : "書き出しました。",
    );
  }

  function openPass(targetSetIndex: number, pass: IaPassName) {
    selectSet(targetSetIndex);
    setTab(TAB_OF_PASS[pass]);
  }

  const setupValue: IaSetupValue = {
    title: session.title,
    date: session.date,
    opponent: session.opponent,
    videoPath: session.videoPath,
    teams: session.teams,
    extras: session.extras,
    sets: session.sets,
  };

  const passTabs: Array<{ tab: Tab; label: string }> = [
    { tab: "p0", label: "P0 ラリー" },
    { tab: "p1", label: "P1 流れ" },
    { tab: "p2", label: "P2 評価" },
    { tab: "p3", label: "P3 ゾーン" },
    { tab: "p4", label: "P4 種類" },
  ];

  const changeRally = (rallyId: string, change: (rally: IaRally) => IaRally) =>
    editSet(activeSet?.setIndex ?? setIndex, (set) => ({
      ...set,
      rallies: set.rallies.map((rally) => (rally.id === rallyId ? change(rally) : rally)),
    }));

  return (
    <main className="page-shell stack ia-page">
      <section className="panel">
        <div className="panel-inner stack">
          <div className="ia-header">
            <div>
              <Link href={listHref} className="muted">
                ← 打ち込み補助
              </Link>
              <h2 className="ia-title">{session.title}</h2>
              <p className="muted ia-note">
                {session.date} / {session.teams.home.name} vs {session.teams.away.name}
              </p>
            </div>
            <div className="ia-header-actions">
              <span className={`ia-save ia-save-${saveState}`}>{SAVE_LABELS[saveState]}</span>
              <label className="button secondary ia-file-button">
                骨組みを読み込む
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    void importSkeleton(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <button type="button" className="button secondary" onClick={exportVsm}>
                VSMをダウンロード
              </button>
              <button type="button" className="button" onClick={() => void saveToMatchViewer()} disabled={savingViewer}>
                {savingViewer ? "保存中…" : "試合ビューアに保存"}
              </button>
              {session.matchViewer ? (
                <Link
                  href={buildWorkspacePath({ teamSlug, workspaceId: session.matchViewer.workspaceId })}
                  className="button secondary"
                  target="_blank"
                >
                  試合ビューアで開く
                </Link>
              ) : null}
            </div>
          </div>
          <IaAssignmentBoard
            session={session}
            assignments={assignments}
            passSeconds={passSecondsList}
            memberId={currentMember.id}
            activeSetIndex={activeSet?.setIndex}
            activePass={passName}
            onOpen={openPass}
            onAction={(action, targetSetIndex, pass, force) => void assign(action, targetSetIndex, pass, force)}
          />
          <IaAiJobStatusLine job={aiJobs.latest} session={session} onOpen={() => setTab("setup")} />
          {metaConflict ? (
            <div className="ia-banner">
              <span>ほかの画面で、試合の準備(名前・チーム・セット)が先に保存されました。</span>
              <button type="button" className="button secondary" onClick={reloadMeta}>
                読み込み直す
              </button>
              <button type="button" className="button secondary" onClick={overwriteMeta}>
                この画面の内容で保存する
              </button>
            </div>
          ) : null}
          {takeover && passName && takeover.setIndex === activeSet?.setIndex && takeover.pass === passName ? (
            <div className="ia-banner">
              <span>
                {takeover.lost
                  ? `${takeover.holderName}さんが、${takeover.setIndex}セット目の ${takeover.pass} を引き継ぎました。`
                  : `${takeover.setIndex}セット目の ${takeover.pass} は、${takeover.holderName}さんが打っています。`}
              </span>
              <button
                type="button"
                className="button secondary"
                onClick={() => void assign("claim", takeover.setIndex, takeover.pass, true)}
              >
                引き継ぐ
              </button>
              <button type="button" className="button secondary" onClick={dismissTakeover}>
                このまま見る
              </button>
            </div>
          ) : null}
          {remoteNotice && remoteNotice.key === activeKey && !remoteNotice.hidden ? (
            <div className="ia-banner">
              <span>
                {remoteNotice.record.updatedByName ?? "ほかの人"}さんが、このセットの {remoteNotice.record.pass}{" "}
                を保存しました。
              </span>
              <button type="button" className="button secondary" onClick={acceptRemote}>
                読み込む
              </button>
              <button type="button" className="button secondary" onClick={dismissRemote}>
                あとで
              </button>
            </div>
          ) : null}
          {mergeNotice ? (
            <div className="ia-banner">
              <span>{mergeNotice}</span>
              <button type="button" className="button secondary" onClick={clearMergeNotice}>
                閉じる
              </button>
            </div>
          ) : null}
          {errorMessage ? <p className="ia-error">{errorMessage}</p> : null}
          <SetChecks checks={checks} activeSetIndex={activeSet?.setIndex} onSelect={selectSet} />
          <div className="tab-row" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "setup"}
              className={`tab-button ${tab === "setup" ? "tab-button-active" : ""}`}
              onClick={() => setTab("setup")}
            >
              準備
            </button>
            {passTabs.map((entry) => (
              <button
                type="button"
                role="tab"
                key={entry.tab}
                aria-selected={tab === entry.tab}
                className={`tab-button ${tab === entry.tab ? "tab-button-active" : ""}`}
                onClick={() => setTab(entry.tab)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {message ? (
            <p className="ia-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </section>

      {tab === "setup" ? (
        <section className="panel">
          <div className="panel-inner stack">
            <IaAiJobPanel
              session={session}
              jobs={aiJobs}
              onRequest={() => void aiJobs.request(saveNow)}
              onApply={applyAiSkeleton}
            />
            <IaSetupEditor
              value={setupValue}
              onChange={(next) => edit((current) => ({ ...current, ...next }))}
              teamSlug={teamSlug}
            />
          </div>
        </section>
      ) : tab === "p1" && activeSet && setResult ? (
        <IaFlowPass
          key={activeSet.setIndex}
          session={session}
          set={activeSet}
          setResult={setResult}
          progress={progress}
          passSeconds={formatDuration(passSeconds)}
          onSelectSet={selectSet}
          onChangeRally={changeRally}
          onActivity={markActivity}
        />
      ) : tab === "p2" && activeSet && setResult ? (
        <IaEffectPass
          key={activeSet.setIndex}
          session={session}
          set={activeSet}
          setResult={setResult}
          progress={effectProgressList}
          passSeconds={formatDuration(passSeconds)}
          onSelectSet={selectSet}
          onChangeRally={changeRally}
          onActivity={markActivity}
        />
      ) : tab === "p3" && activeSet && setResult ? (
        <IaZonePass
          key={activeSet.setIndex}
          session={session}
          set={activeSet}
          setResult={setResult}
          progress={zoneProgressList}
          passSeconds={formatDuration(passSeconds)}
          onSelectSet={selectSet}
          onChangeRally={changeRally}
          onActivity={markActivity}
        />
      ) : tab === "p4" && activeSet && setResult ? (
        <IaTypePass
          key={activeSet.setIndex}
          session={session}
          set={activeSet}
          setResult={setResult}
          history={typeHistory}
          progress={typeProgressList}
          passSeconds={formatDuration(passSeconds)}
          onSelectSet={selectSet}
          onChangeRally={changeRally}
          onActivity={markActivity}
        />
      ) : activeSet && setResult ? (
        <div className="ia-p0">
          <section className="panel ia-video-panel">
            <div className="panel-inner stack">
              <IaPlayer ref={playerRef} youtubeUrl={activeSet.youtubeUrl} onTime={handleTime} />
              <div className="ia-now">
                <span className="mono">{formatClock(currentTime)}</span>
                <label className="ia-check">
                  <input type="checkbox" checked={continuous} onChange={(event) => setContinuous(event.target.checked)} />
                  続けて流す
                </label>
                <IaRateButtons rate={rate} onChange={changeRate} />
                <span className="muted">
                  {PASS_LABELS.P0}の時間:{formatDuration(passSeconds)}
                </span>
              </div>
              <SelectedRallyInfo
                session={session}
                set={activeSet}
                rally={selectedRally}
                result={selectedRally ? setResult.byRallyId.get(selectedRally.id) : undefined}
              />
              <div className="ia-keys">
                <button type="button" className="button secondary" onClick={() => label("near")}>
                  <kbd>N</kbd> 手前のサーブ
                </button>
                <button type="button" className="button secondary" onClick={() => label("far")}>
                  <kbd>F</kbd> 奥のサーブ
                </button>
                <button type="button" className="button secondary" onClick={() => label("not_rally")}>
                  <kbd>X</kbd> ラリーでない
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    selectedRallyId
                      ? playRally(selectedRallyId, sortedRallies)
                      : sortedRallies.length === 0
                        ? togglePlay()
                        : moveBy(1)
                  }
                >
                  <kbd>Space</kbd> もう一度
                </button>
                <button type="button" className="button secondary" onClick={togglePlay}>
                  <kbd>K</kbd> 流す・止める
                </button>
                <button type="button" className="button secondary" onClick={() => moveBy(-1)}>
                  <kbd>←</kbd> 前
                </button>
                <button type="button" className="button secondary" onClick={() => moveBy(1)}>
                  <kbd>→</kbd> 次
                </button>
                <button type="button" className="button secondary" onClick={insertRally}>
                  <kbd>I</kbd> 今の時刻に足す
                </button>
                <button type="button" className="button secondary" onClick={() => nudge(-NUDGE_SECONDS)} disabled={!selectedRally}>
                  <kbd>,</kbd> 0.5秒前へ
                </button>
                <button type="button" className="button secondary" onClick={() => nudge(NUDGE_SECONDS)} disabled={!selectedRally}>
                  <kbd>.</kbd> 0.5秒後へ
                </button>
              </div>
              <SubstitutionEditor
                session={session}
                set={activeSet}
                getTime={() => playerRef.current?.getTime() ?? currentTime}
                onChange={(patch) => editSet(activeSet.setIndex, (set) => ({ ...set, ...patch }))}
              />
            </div>
          </section>
          <section className="panel ia-rally-panel">
            <div className="panel-inner stack">
              <div className="ia-rally-head">
                <h3 className="ia-subheading">{activeSet.setIndex}セット目のラリー</h3>
                <span className="muted">
                  {sortedRallies.length}件{setResult.undecidedRallies > 0 ? ` / 向き未定 ${setResult.undecidedRallies}` : ""}
                </span>
              </div>
              {sortedRallies.length === 0 ? (
                <p className="muted">
                  ラリーがありません。骨組みを読み込むか、<kbd>K</kbd> で動画を流し、サーブのたびに <kbd>I</kbd>{" "}
                  で足して <kbd>N</kbd>・<kbd>F</kbd> で向きを決めてください(続けて流すなら、動画は止まりません)。
                </p>
              ) : (
                <ol className="ia-rally-list">
                  {sortedRallies.map((rally) => {
                    const result = setResult.byRallyId.get(rally.id);
                    const servingTeam = rally.side ? servingTeamOf(activeSet, rally.side) : null;
                    const classes = [
                      "ia-rally",
                      rally.id === selectedRallyId ? "ia-rally-active" : "",
                      rally.status === "not_rally" ? "ia-rally-out" : "",
                      isLowConfidence(rally) ? "ia-rally-low" : "",
                    ].join(" ");
                    return (
                      <li
                        key={rally.id}
                        className={classes}
                        ref={(element) => {
                          if (element) {
                            rowRefs.current.set(rally.id, element);
                          } else {
                            rowRefs.current.delete(rally.id);
                          }
                        }}
                      >
                        <button type="button" className="ia-rally-main" onClick={() => playRally(rally.id, sortedRallies)}>
                          <span className="ia-rally-no">{result ? result.number : "–"}</span>
                          <span className="mono">{formatClock(rally.serveTime)}</span>
                          <span className={`ia-side ia-side-${rally.status === "not_rally" ? "out" : (rally.side ?? "none")}`}>
                            {rally.status === "not_rally"
                              ? "ラリーでない"
                              : rally.side
                                ? `${rally.side === "near" ? "手前" : "奥"}(${servingTeam ? session.teams[servingTeam].name : ""})`
                                : "向き未定"}
                          </span>
                          <span className="ia-rally-meta">
                            {result
                              ? `${result.server ?? "?"}番 → ${result.scoreAfter.home}-${result.scoreAfter.away}${result.pointGuessed ? "?" : ""}`
                              : ""}
                          </span>
                          <span className="ia-rally-flags">
                            {typeof rally.confidence === "number" ? (
                              <span className="muted">{Math.round(rally.confidence * 100)}%</span>
                            ) : null}
                            {rally.source === "manual" ? <span className="tag">足した</span> : null}
                            {rally.checked ? <span className="ia-checked">確認</span> : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="ia-rally-remove"
                          aria-label="このラリーを消す"
                          onClick={() => removeRally(rally.id)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-inner">
            <p className="muted">セットがありません。準備でセットを足してください。</p>
          </div>
        </section>
      )}
    </main>
  );
}

function SetChecks({
  checks,
  activeSetIndex,
  onSelect,
}: {
  checks: IaSetCheck[];
  activeSetIndex?: number;
  onSelect: (setIndex: number) => void;
}) {
  if (checks.length === 0) {
    return null;
  }
  const mark = (value: boolean | null) => (value === null ? "–" : value ? "✓" : "✗");
  return (
    <div className="ia-checks">
      {checks.map((check) => (
        <button
          type="button"
          key={check.setIndex}
          className={`ia-check-card ${check.setIndex === activeSetIndex ? "ia-check-card-active" : ""} ${
            check.countMatches && check.scoreMatches ? "ia-check-ok" : check.countMatches === false || check.scoreMatches === false ? "ia-check-ng" : ""
          }`}
          onClick={() => onSelect(check.setIndex)}
        >
          <strong>{check.setIndex}セット目</strong>
          <span>
            ラリー {check.countedRallies} / {check.requiredRallies ?? "?"} {mark(check.countMatches)}
          </span>
          <span>
            得点 {check.score.home}-{check.score.away} / {check.finalScore.home ?? "?"}-{check.finalScore.away ?? "?"}{" "}
            {mark(check.scoreMatches)}
          </span>
        </button>
      ))}
    </div>
  );
}

function SelectedRallyInfo({
  session,
  set,
  rally,
  result,
}: {
  session: InputAssistSession;
  set: IaSet;
  rally?: IaRally;
  result?: ReturnType<typeof computeSet>["rallies"][number];
}) {
  if (!rally) {
    return <p className="muted ia-note">ラリーを選ぶと、その区間だけを流します。</p>;
  }
  if (!result) {
    return (
      <p className="muted ia-note">
        {formatClock(rally.serveTime)} のラリー:{rally.status === "not_rally" ? "ラリーでない" : "向きを決めると、サーバーと得点が出ます"}
      </p>
    );
  }
  const teamName = (team: IaTeamSide) => session.teams[team].name;
  return (
    <div className="ia-selected">
      <div>
        <span className="muted">サーブ</span>
        <strong>
          {teamName(result.servingTeam)} {result.server ?? "?"}番
        </strong>
      </div>
      <div>
        <span className="muted">ローテ</span>
        <strong>
          {teamName("home")} {formatRotation(result.lineup.home)} / {teamName("away")} {formatRotation(result.lineup.away)}
        </strong>
      </div>
      <div>
        <span className="muted">このラリーの前</span>
        <strong>
          {result.scoreBefore.home}-{result.scoreBefore.away}
        </strong>
      </div>
      <div>
        <span className="muted">手前</span>
        <strong>{teamName(set.nearTeam)}</strong>
      </div>
    </div>
  );
}

function SubstitutionEditor({
  session,
  set,
  getTime,
  onChange,
}: {
  session: InputAssistSession;
  set: IaSet;
  getTime: () => number;
  onChange: (patch: Partial<Pick<IaSet, "substitutions" | "timeouts">>) => void;
}) {
  const [team, setTeam] = useState<IaTeamSide>("home");
  const [playerOut, setPlayerOut] = useState("");
  const [playerIn, setPlayerIn] = useState("");
  const entries = [
    ...set.substitutions.map((substitution) => ({ kind: "sub" as const, id: substitution.id, time: substitution.time, team: substitution.team, substitution })),
    ...set.timeouts.map((timeout) => ({ kind: "timeout" as const, id: timeout.id, time: timeout.time, team: timeout.team, substitution: null })),
  ].sort((left, right) => left.time - right.time);

  function add() {
    const outNumber = Math.trunc(Number(playerOut));
    const inNumber = Math.trunc(Number(playerIn));
    if (!(outNumber > 0 && inNumber > 0)) {
      return;
    }
    onChange({
      substitutions: [
        ...set.substitutions,
        { id: createObjectId(), time: roundTime(getTime()), team, playerIn: inNumber, playerOut: outNumber },
      ],
    });
    setPlayerOut("");
    setPlayerIn("");
  }

  return (
    <details className="ia-subs">
      <summary>
        交代 {set.substitutions.length} / タイムアウト {set.timeouts.length}
      </summary>
      <div className="ia-inline-form">
        <div className="field">
          <label htmlFor="ia-sub-team">チーム</label>
          <select id="ia-sub-team" value={team} onChange={(event) => setTeam(event.target.value === "away" ? "away" : "home")}>
            <option value="home">{session.teams.home.name}</option>
            <option value="away">{session.teams.away.name}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ia-sub-out">出る</label>
          <input id="ia-sub-out" type="number" min={0} max={99} value={playerOut} onChange={(event) => setPlayerOut(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ia-sub-in">入る</label>
          <input id="ia-sub-in" type="number" min={0} max={99} value={playerIn} onChange={(event) => setPlayerIn(event.target.value)} />
        </div>
        <button type="button" className="button secondary" onClick={add}>
          交代を入れる
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onChange({ timeouts: [...set.timeouts, { id: createObjectId(), time: roundTime(getTime()), team }] })
          }
        >
          タイムアウトを入れる
        </button>
      </div>
      <p className="muted ia-note">今の動画の時刻で入ります。その時刻より後のラリーから反映します。</p>
      {entries.length > 0 ? (
        <ul className="ia-sub-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="mono">{formatClock(entry.time)}</span> {session.teams[entry.team].name}{" "}
              {entry.substitution ? `交代 ${entry.substitution.playerOut}→${entry.substitution.playerIn}` : "タイムアウト"}
              <button
                type="button"
                className="ia-rally-remove"
                aria-label="消す"
                onClick={() =>
                  onChange(
                    entry.kind === "sub"
                      ? { substitutions: set.substitutions.filter((item) => item.id !== entry.id) }
                      : { timeouts: set.timeouts.filter((item) => item.id !== entry.id) },
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
