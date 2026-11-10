"use client";

import { useEffect, useState } from "react";
import { formatClockInput, parseClockInput } from "@/lib/domain/input-assist/ai-job";
import {
  addMissingPlayers,
  readScoutRosterFile,
  toRosterView,
  type ScoutRosterView,
} from "@/lib/domain/input-assist/roster";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import {
  IA_POSITIONS,
  type IaLineup,
  type IaMatchExtras,
  type IaPlayer,
  type IaSet,
  type IaTeam,
  type IaTeamSide,
} from "@/lib/domain/input-assist/types";
import { buildTeamApiPath } from "@/lib/domain/team";

export type IaSetupValue = {
  title: string;
  date: string;
  opponent: string;
  videoPath?: string;
  teams: Record<IaTeamSide, IaTeam>;
  extras: IaMatchExtras;
  sets: IaSet[];
};

type IaSetupEditorProps = {
  value: IaSetupValue;
  onChange: (next: IaSetupValue) => void;
  teamSlug: string;
};

type RosterFileChoice = { fileId: string; name: string; folder: string; extension: ".vsm" | ".vsdb" };

const TEAM_LABELS: Record<IaTeamSide, string> = { home: "ホーム", away: "アウェイ" };
const MAX_SETS = 5;

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function rosterLabel(team: IaTeam): string {
  return team.players.length ? `${team.name}(${team.players.length}人)` : team.name;
}

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return ((await response.json().catch(() => null)) ?? {}) as T & { error?: string };
}

/** 試合の準備:名簿(データライブラリの vsdb / vsm から)、セットごとの動画・開始時刻・スタメン・最終スコア。 */
export function IaSetupEditor({ value, onChange, teamSlug }: IaSetupEditorProps) {
  const [roster, setRoster] = useState<ScoutRosterView | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [rosterNote, setRosterNote] = useState("");
  const [libraryFiles, setLibraryFiles] = useState<RosterFileChoice[] | null>(null);
  const [libraryFileId, setLibraryFileId] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [useLineups, setUseLineups] = useState(true);
  const [homeTeamIndex, setHomeTeamIndex] = useState(0);
  const [awayTeamIndex, setAwayTeamIndex] = useState(1);

  const update = (patch: Partial<IaSetupValue>) => onChange({ ...value, ...patch });
  const updateSet = (setIndex: number, patch: Partial<IaSet>) =>
    update({ sets: value.sets.map((set) => (set.setIndex === setIndex ? { ...set, ...patch } : set)) });
  const updateLineup = (set: IaSet, team: IaTeamSide, lineup: IaLineup) =>
    updateSet(set.setIndex, { startingLineup: { ...set.startingLineup, [team]: lineup } });

  // データライブラリの vsdb・vsm の一覧(開いたときに1回)
  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const response = await fetch(buildTeamApiPath("/api/input-assist/roster", teamSlug), { cache: "no-store" });
        const payload = await readJson<{ files?: RosterFileChoice[] }>(response);
        if (!stopped) {
          setLibraryFiles(response.ok ? (payload.files ?? []) : []);
          // 今シーズンの vsdb(一覧の先頭)を選んでおく
          setLibraryFileId((current) => current || payload.files?.[0]?.fileId || "");
        }
      } catch {
        if (!stopped) {
          setLibraryFiles([]);
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [teamSlug]);

  function showRoster(parsed: ScoutRosterView) {
    setRoster(parsed);
    setMatchIndex(Math.max(0, parsed.matches.length - 1));
    setHomeTeamIndex(0);
    setAwayTeamIndex(parsed.teams.length > 1 ? 1 : 0);
  }

  async function loadLibraryRoster() {
    setRosterError("");
    setRosterNote("");
    setRoster(null);
    if (!libraryFileId) {
      return;
    }
    setLoadingRoster(true);
    try {
      const response = await fetch(
        buildTeamApiPath(`/api/input-assist/roster?fileId=${encodeURIComponent(libraryFileId)}`, teamSlug),
        { cache: "no-store" },
      );
      const payload = await readJson<{ roster?: ScoutRosterView }>(response);
      if (!response.ok || !payload.roster) {
        throw new Error(payload.error ?? "名簿を読めませんでした。");
      }
      showRoster(payload.roster);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "名簿を読めませんでした。");
    } finally {
      setLoadingRoster(false);
    }
  }

  async function handleRosterFile(file: File | undefined) {
    setRosterError("");
    setRosterNote("");
    setRoster(null);
    if (!file) {
      return;
    }
    try {
      showRoster(toRosterView(readScoutRosterFile(await file.text(), file.name)));
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "ファイルを読めませんでした。");
    }
  }

  /** 部内ポータルの名簿(背番号・名前)から、ホームにいない選手を足す。 */
  async function addPortalPlayers() {
    setRosterError("");
    setRosterNote("");
    try {
      const response = await fetch(buildTeamApiPath("/api/input-assist/roster?source=portal", teamSlug), {
        cache: "no-store",
      });
      const payload = await readJson<{ players?: IaPlayer[] }>(response);
      if (!response.ok || !payload.players) {
        throw new Error(payload.error ?? "部内の名簿を読めませんでした。");
      }
      const { team, added } = addMissingPlayers(value.teams.home, payload.players);
      if (added.length === 0) {
        setRosterNote("足す選手はいません(部内の名簿の背番号は、みんなホームにいます)。");
        return;
      }
      update({ teams: { ...value.teams, home: team } });
      setRosterNote(`ホームに背番号 ${added.join("・")} を足しました。`);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "部内の名簿を読めませんでした。");
    }
  }

  function applyMatch() {
    const match = roster?.matches[matchIndex];
    if (!match) {
      return;
    }
    let sets = value.sets;
    if (useLineups && match.sets.length > 0) {
      sets = match.sets.map((entry) => {
        const base = value.sets.find((set) => set.setIndex === entry.setIndex) ?? createEmptySet(entry.setIndex);
        return {
          ...base,
          startingLineup: entry.startingLineup ?? base.startingLineup,
          finalScore: entry.finalScore ?? base.finalScore,
        };
      });
    }
    const opponent = value.opponent || match.teams.away.name;
    update({ teams: match.teams, extras: match.extras, sets, opponent });
  }

  function applyTeams() {
    const home = roster?.teams[homeTeamIndex];
    const away = roster?.teams[awayTeamIndex];
    if (!home || !away) {
      return;
    }
    // 名簿から取るのは選手とチームだけ。攻撃コンビ・セッターコールは書き出しのとき昨シーズンの手直し版を使う。
    update({ teams: { home, away }, opponent: value.opponent || away.name });
  }

  function addSet() {
    const last = value.sets.at(-1);
    const setIndex = (last?.setIndex ?? 0) + 1;
    if (setIndex > MAX_SETS) {
      return;
    }
    update({ sets: [...value.sets, createEmptySet(setIndex, last)] });
  }

  function removeLastSet() {
    const last = value.sets.at(-1);
    if (!last) {
      return;
    }
    if (last.rallies.length > 0 && !window.confirm(`${last.setIndex}セット目のラリー ${last.rallies.length} 本も消えます。よいですか?`)) {
      return;
    }
    update({ sets: value.sets.slice(0, -1) });
  }

  return (
    <div className="stack">
      <div className="ia-field-grid">
        <div className="field">
          <label htmlFor="ia-title">試合の名前</label>
          <input
            id="ia-title"
            value={value.title}
            maxLength={80}
            placeholder="例:秋季リーグ 千葉大"
            onChange={(event) => update({ title: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ia-date">日付</label>
          <input id="ia-date" type="date" value={value.date} onChange={(event) => update({ date: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ia-opponent">相手</label>
          <input
            id="ia-opponent"
            value={value.opponent}
            maxLength={80}
            onChange={(event) => update({ opponent: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ia-video-path">動画のファイル名(VSM 用)</label>
          <input
            id="ia-video-path"
            value={value.videoPath ?? ""}
            maxLength={260}
            placeholder="なければ「日付_相手.mp4」"
            onChange={(event) => update({ videoPath: event.target.value })}
          />
        </div>
      </div>

      <section className="soft-panel stack">
        <h3 className="ia-subheading">名簿</h3>
        <p className="muted ia-note">
          ホーム:{rosterLabel(value.teams.home)} / アウェイ:{rosterLabel(value.teams.away)}
        </p>
        <div className="ia-inline-form">
          <div className="field">
            <label htmlFor="ia-roster-library">データライブラリから</label>
            <select
              id="ia-roster-library"
              value={libraryFileId}
              disabled={!libraryFiles || libraryFiles.length === 0}
              onChange={(event) => setLibraryFileId(event.target.value)}
            >
              {libraryFiles === null ? <option value="">読み込み中…</option> : null}
              {libraryFiles?.length === 0 ? <option value="">vsdb・vsm がありません</option> : null}
              {libraryFiles?.map((file) => (
                <option key={file.fileId} value={file.fileId}>
                  {file.folder ? `${file.folder} / ` : ""}
                  {file.name}({file.extension.slice(1)})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => void loadLibraryRoster()}
            disabled={!libraryFileId || loadingRoster}
          >
            {loadingRoster ? "読み込み中…" : "読み込む"}
          </button>
          <button type="button" className="button secondary" onClick={() => void addPortalPlayers()}>
            部内の名簿からホームに足す
          </button>
        </div>
        <details>
          <summary className="muted">手元のファイルから読み込む</summary>
          <div className="field">
            <label htmlFor="ia-roster-file">vsdb か vsm</label>
            <input
              id="ia-roster-file"
              type="file"
              accept=".vsdb,.vsm,application/json"
              onChange={(event) => void handleRosterFile(event.target.files?.[0])}
            />
          </div>
        </details>
        {rosterError ? <p className="ia-error">{rosterError}</p> : null}
        {rosterNote ? <p className="muted ia-note">{rosterNote}</p> : null}
        {roster && roster.matches.length > 0 ? (
          <div className="ia-inline-form">
            <div className="field">
              <label htmlFor="ia-roster-match">試合から</label>
              <select id="ia-roster-match" value={matchIndex} onChange={(event) => setMatchIndex(Number(event.target.value))}>
                {roster.matches.map((match) => (
                  <option key={match.index} value={match.index}>
                    {match.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="ia-check">
              <input type="checkbox" checked={useLineups} onChange={(event) => setUseLineups(event.target.checked)} />
              スタメンとスコアも使う
            </label>
            <button type="button" className="button secondary" onClick={applyMatch}>
              この試合のチームを使う
            </button>
          </div>
        ) : null}
        {roster && roster.kind === "vsdb" && roster.teams.length > 0 ? (
          <div className="ia-inline-form">
            {(["home", "away"] as const).map((side) => (
              <div className="field" key={side}>
                <label htmlFor={`ia-roster-${side}`}>{TEAM_LABELS[side]}</label>
                <select
                  id={`ia-roster-${side}`}
                  value={side === "home" ? homeTeamIndex : awayTeamIndex}
                  onChange={(event) =>
                    side === "home"
                      ? setHomeTeamIndex(Number(event.target.value))
                      : setAwayTeamIndex(Number(event.target.value))
                  }
                >
                  {roster.teams.map((team, index) => (
                    <option key={`${team.name}-${index}`} value={index}>
                      {rosterLabel(team)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" className="button secondary" onClick={applyTeams}>
              このチームを使う
            </button>
          </div>
        ) : null}
      </section>

      {value.sets.map((set) => (
        <section className="soft-panel stack" key={set.setIndex}>
          <h3 className="ia-subheading">{set.setIndex}セット目</h3>
          <label className="ia-checkbox">
            <input
              type="checkbox"
              checked={Boolean(set.skipped)}
              onChange={(event) => updateSet(set.setIndex, { skipped: event.target.checked })}
            />
            このセットは打たない(一覧・得点の確認・VSM の書き出しから外す)
          </label>
          {set.skipped ? null : (
          <>
          <div className="ia-field-grid">
            <div className="field ia-field-wide">
              <label htmlFor={`ia-url-${set.setIndex}`}>YouTube の URL</label>
              <input
                id={`ia-url-${set.setIndex}`}
                value={set.youtubeUrl}
                placeholder="https://youtu.be/…"
                onChange={(event) => updateSet(set.setIndex, { youtubeUrl: event.target.value })}
              />
            </div>
            <StartTimeField
              set={set}
              nextSet={value.sets.find((entry) => entry.setIndex === set.setIndex + 1)}
              onChange={(startTime) => updateSet(set.setIndex, { startTime })}
            />
            <div className="field">
              <label htmlFor={`ia-near-${set.setIndex}`}>手前のチーム</label>
              <select
                id={`ia-near-${set.setIndex}`}
                value={set.nearTeam}
                onChange={(event) => updateSet(set.setIndex, { nearTeam: event.target.value === "away" ? "away" : "home" })}
              >
                <option value="home">{value.teams.home.name}</option>
                <option value="away">{value.teams.away.name}</option>
              </select>
            </div>
            <div className="field">
              <span className="ia-label">最終スコア</span>
              <div className="ia-score-inputs">
                {(["home", "away"] as const).map((side) => (
                  <input
                    key={side}
                    type="number"
                    min={0}
                    max={60}
                    inputMode="numeric"
                    aria-label={`${set.setIndex}セット目 ${value.teams[side].name} の得点`}
                    value={set.finalScore[side] ?? ""}
                    onChange={(event) =>
                      updateSet(set.setIndex, {
                        finalScore: { ...set.finalScore, [side]: parseNumber(event.target.value) },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          {(["home", "away"] as const).map((side) => (
            <LineupEditor
              key={side}
              idPrefix={`ia-lineup-${set.setIndex}-${side}`}
              label={`スタメン:${value.teams[side].name}`}
              team={value.teams[side]}
              lineup={set.startingLineup[side]}
              onChange={(lineup) => updateLineup(set, side, lineup)}
            />
          ))}
          </>
          )}
        </section>
      ))}

      <div className="button-row">
        <button type="button" className="button secondary" onClick={addSet} disabled={(value.sets.at(-1)?.setIndex ?? 0) >= MAX_SETS}>
          セットを足す
        </button>
        <button type="button" className="button secondary" onClick={removeLastSet} disabled={value.sets.length === 0}>
          最後のセットを消す
        </button>
      </div>
    </div>
  );
}

/** セットの開始時刻(そのセットの動画の何分何秒から)。終わりは、次のセットが同じ動画なら、その開始時刻。 */
function StartTimeField({
  set,
  nextSet,
  onChange,
}: {
  set: IaSet;
  nextSet?: IaSet;
  onChange: (startTime: number | null) => void;
}) {
  const saved = formatClockInput(set.startTime);
  const [text, setText] = useState(saved);
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : saved;
  const invalid = editing && text.trim() !== "" && parseClockInput(text) === null;
  const sameVideo = nextSet && nextSet.youtubeUrl.trim() && nextSet.youtubeUrl.trim() === set.youtubeUrl.trim();
  const end = sameVideo && typeof nextSet?.startTime === "number" ? formatClockInput(nextSet.startTime) : "";
  const id = `ia-start-${set.setIndex}`;
  return (
    <div className="field">
      <label htmlFor={id}>セットの開始時刻</label>
      <input
        id={id}
        value={shown}
        inputMode="numeric"
        placeholder="例:24:18"
        aria-invalid={invalid}
        onFocus={() => {
          setText(saved);
          setEditing(true);
        }}
        onChange={(event) => {
          setText(event.target.value);
          const seconds = parseClockInput(event.target.value);
          if (event.target.value.trim() === "" || seconds !== null) {
            onChange(seconds);
          }
        }}
        onBlur={() => setEditing(false)}
      />
      <span className="muted ia-note">
        {invalid ? "「分:秒」か秒で入れてください" : end ? `終わり:${end}(次のセットの開始)` : "終わり:動画の最後"}
      </span>
    </div>
  );
}

function LineupEditor({
  idPrefix,
  label,
  team,
  lineup,
  onChange,
}: {
  idPrefix: string;
  label: string;
  team: IaTeam;
  lineup: IaLineup;
  onChange: (lineup: IaLineup) => void;
}) {
  const listId = `${idPrefix}-players`;
  return (
    <div className="ia-lineup">
      <span className="ia-label">{label}</span>
      <datalist id={listId}>
        {team.players.map((player) => (
          <option key={player.shirtNumber} value={player.shirtNumber}>
            {[player.lastName, player.firstName].filter(Boolean).join(" ")}
          </option>
        ))}
      </datalist>
      <div className="ia-lineup-grid">
        {IA_POSITIONS.map((position) => (
          <label key={position} className="ia-lineup-cell">
            <span className="muted">{position}</span>
            <input
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              list={listId}
              value={lineup.positions[position] ?? ""}
              onChange={(event) =>
                onChange({ ...lineup, positions: { ...lineup.positions, [position]: parseNumber(event.target.value) } })
              }
            />
          </label>
        ))}
        <label className="ia-lineup-cell">
          <span className="muted">S の位置</span>
          <select
            value={lineup.setterAt}
            onChange={(event) => onChange({ ...lineup, setterAt: Number(event.target.value) })}
          >
            {IA_POSITIONS.map((position) => (
              <option key={position} value={Number(position)}>
                {position}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
