"use client";

import { useState } from "react";
import { readScoutRosterFile, type ScoutRosterFile } from "@/lib/domain/input-assist/roster";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import {
  IA_POSITIONS,
  type IaLineup,
  type IaMatchExtras,
  type IaSet,
  type IaTeam,
  type IaTeamSide,
} from "@/lib/domain/input-assist/types";

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
};

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

/** 試合の準備:名簿(vsdb / vsm から)、セットごとの動画・スタメン・最終スコア。 */
export function IaSetupEditor({ value, onChange }: IaSetupEditorProps) {
  const [roster, setRoster] = useState<ScoutRosterFile | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [useLineups, setUseLineups] = useState(true);
  const [homeTeamIndex, setHomeTeamIndex] = useState(0);
  const [awayTeamIndex, setAwayTeamIndex] = useState(1);

  const update = (patch: Partial<IaSetupValue>) => onChange({ ...value, ...patch });
  const updateSet = (setIndex: number, patch: Partial<IaSet>) =>
    update({ sets: value.sets.map((set) => (set.setIndex === setIndex ? { ...set, ...patch } : set)) });
  const updateLineup = (set: IaSet, team: IaTeamSide, lineup: IaLineup) =>
    updateSet(set.setIndex, { startingLineup: { ...set.startingLineup, [team]: lineup } });

  async function handleRosterFile(file: File | undefined) {
    setRosterError("");
    setRoster(null);
    if (!file) {
      return;
    }
    try {
      const parsed = readScoutRosterFile(await file.text(), file.name);
      setRoster(parsed);
      setMatchIndex(Math.max(0, parsed.matches.length - 1));
      setHomeTeamIndex(0);
      setAwayTeamIndex(parsed.teams.length > 1 ? 1 : 0);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "ファイルを読めませんでした。");
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
        <div className="field">
          <label htmlFor="ia-roster-file">vsdb か vsm から読み込む</label>
          <input
            id="ia-roster-file"
            type="file"
            accept=".vsdb,.vsm,application/json"
            onChange={(event) => void handleRosterFile(event.target.files?.[0])}
          />
        </div>
        {rosterError ? <p className="ia-error">{rosterError}</p> : null}
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
