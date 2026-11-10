// 得点・ローテーション・サーバーの計算(scouting-ai の vsm_writer.py と同じ決まり)。
// - ラリー i で点を取ったのは、ラリー i+1 でサーブした側(サイドアウトの決まり)
// - セットの最後のラリーは、そのセットを取ったチームの得点
// - サーブ権が移ったら、取ったチームがローテーションする(2の位置の選手が1へ)
// - サーバーは、サーブするチームの1の位置の選手
// - 選手交代は、交代した時刻より後のラリーから、入った選手が出た選手の位置に入る
// - タイムアウトは並びを変えない(書き出すときにイベントとして入れるだけ)

import {
  IA_POSITIONS,
  type IaCourtSide,
  type IaLineup,
  type IaRally,
  type IaSet,
  type IaSubstitution,
  type IaTeamCode,
  type IaTimeout,
  type IaTeamSide,
} from "@/lib/domain/input-assist/types";

export type IaScore = { home: number; away: number };

export function otherTeam(team: IaTeamSide): IaTeamSide {
  return team === "home" ? "away" : "home";
}

export function teamCode(team: IaTeamSide): IaTeamCode {
  return team === "home" ? "*" : "a";
}

export function teamFromCode(code: string): IaTeamSide {
  return code === "a" ? "away" : "home";
}

/** 手前/奥 → ホーム/アウェイ(セットごとに、どちらが手前かを持つ)。 */
export function servingTeamOf(set: Pick<IaSet, "nearTeam">, side: IaCourtSide): IaTeamSide {
  return side === "near" ? set.nearTeam : otherTeam(set.nearTeam);
}

export function courtSideOf(set: Pick<IaSet, "nearTeam">, team: IaTeamSide): IaCourtSide {
  return team === set.nearTeam ? "near" : "far";
}

export function cloneLineup(lineup: IaLineup): IaLineup {
  return { positions: { ...lineup.positions }, setterAt: lineup.setterAt };
}

/** ローテーション:新しい位置 p には、もとの位置 p%6+1 の選手が入る。セッターの位置は 1 つ減る(1 の次は 6)。 */
export function rotateLineup(lineup: IaLineup): IaLineup {
  const positions = { ...lineup.positions };
  for (const position of IA_POSITIONS) {
    const from = String((Number(position) % 6) + 1) as keyof IaLineup["positions"];
    positions[position] = lineup.positions[from];
  }
  const setterAt = lineup.setterAt - 1;
  return { positions, setterAt: setterAt === 0 ? 6 : setterAt };
}

export function applySubstitution(lineup: IaLineup, substitution: Pick<IaSubstitution, "playerIn" | "playerOut">): IaLineup {
  const next = cloneLineup(lineup);
  for (const position of IA_POSITIONS) {
    if (next.positions[position] === substitution.playerOut) {
      next.positions[position] = substitution.playerIn;
    }
  }
  return next;
}

/** 計算に使うラリー:ラリーで、サーブの向きが決まっているもの(時刻の順)。 */
export function getCountedRallies(set: Pick<IaSet, "rallies">): IaRally[] {
  return sortRallies(set.rallies).filter((rally) => rally.status === "rally" && rally.side !== null);
}

export function sortRallies(rallies: IaRally[]): IaRally[] {
  return [...rallies].sort((left, right) => left.serveTime - right.serveTime);
}

export type IaRallyResult = {
  rallyId: string;
  /** 計算に使うラリーの中での番号(1から)。 */
  number: number;
  servingTeam: IaTeamSide;
  /** サーバーの背番号(スタメンが決まっていなければ null)。 */
  server: number | null;
  /** このラリーのときの並び(ローテーション・交代のあと)。 */
  lineup: Record<IaTeamSide, IaLineup>;
  pointWinner: IaTeamSide;
  /** 最後のラリーで、最終スコアが入っていないため点を取った側を推し量ったとき true。 */
  pointGuessed: boolean;
  scoreBefore: IaScore;
  scoreAfter: IaScore;
};

export type IaTimelineEntry =
  | { kind: "rally"; result: IaRallyResult }
  | { kind: "substitution"; substitution: IaSubstitution; lineup: Record<IaTeamSide, IaLineup>; score: IaScore }
  | { kind: "timeout"; timeout: IaTimeout; lineup: Record<IaTeamSide, IaLineup>; score: IaScore };

export type IaSetResult = {
  rallies: IaRallyResult[];
  byRallyId: Map<string, IaRallyResult>;
  timeline: IaTimelineEntry[];
  score: IaScore;
  /** 最終スコアから決まる、要るラリーの数(最終スコアが入っていなければ null)。 */
  requiredRallies: number | null;
  countedRallies: number;
  /** ラリーなのに、サーブの向きがまだ決まっていない数。 */
  undecidedRallies: number;
  countMatches: boolean | null;
  scoreMatches: boolean | null;
};

function hasFinalScore(set: Pick<IaSet, "finalScore">): set is { finalScore: { home: number; away: number } } {
  return typeof set.finalScore.home === "number" && typeof set.finalScore.away === "number";
}

export function getSetWinner(set: Pick<IaSet, "finalScore">): IaTeamSide | null {
  if (!hasFinalScore(set) || set.finalScore.home === set.finalScore.away) {
    return null;
  }
  return set.finalScore.home > set.finalScore.away ? "home" : "away";
}

export function computeSet(set: IaSet): IaSetResult {
  const rallies = getCountedRallies(set);
  // 交代とタイムアウトは時刻の順に。同じ時刻ならタイムアウトを先に。
  const breaks = [
    ...(set.timeouts ?? []).map((timeout) => ({ kind: "timeout" as const, time: timeout.time, timeout })),
    ...set.substitutions.map((substitution) => ({ kind: "substitution" as const, time: substitution.time, substitution })),
  ].sort((left, right) => left.time - right.time || (left.kind === right.kind ? 0 : left.kind === "timeout" ? -1 : 1));
  const setWinner = getSetWinner(set);
  const lineup: Record<IaTeamSide, IaLineup> = {
    home: cloneLineup(set.startingLineup.home),
    away: cloneLineup(set.startingLineup.away),
  };
  const score: IaScore = { home: 0, away: 0 };
  const results: IaRallyResult[] = [];
  const timeline: IaTimelineEntry[] = [];
  let breakIndex = 0;

  const applySubstitutionsBefore = (time: number) => {
    while (breakIndex < breaks.length && breaks[breakIndex].time < time) {
      const entry = breaks[breakIndex];
      breakIndex += 1;
      if (entry.kind === "timeout") {
        timeline.push({
          kind: "timeout",
          timeout: entry.timeout,
          lineup: { home: cloneLineup(lineup.home), away: cloneLineup(lineup.away) },
          score: { ...score },
        });
        continue;
      }
      const substitution = entry.substitution;
      lineup[substitution.team] = applySubstitution(lineup[substitution.team], substitution);
      timeline.push({
        kind: "substitution",
        substitution,
        lineup: { home: cloneLineup(lineup.home), away: cloneLineup(lineup.away) },
        score: { ...score },
      });
    }
  };

  rallies.forEach((rally, index) => {
    applySubstitutionsBefore(rally.serveTime);
    const servingTeam = servingTeamOf(set, rally.side as IaCourtSide);

    const next = rallies[index + 1];
    let pointWinner: IaTeamSide;
    let pointGuessed = false;
    if (next) {
      pointWinner = servingTeamOf(set, next.side as IaCourtSide);
    } else if (setWinner) {
      pointWinner = setWinner;
    } else {
      // 最終スコアがないときは、リードしている側(同点ならサーブした側)の得点とみなす。
      pointGuessed = true;
      pointWinner = score.home === score.away ? servingTeam : score.home > score.away ? "home" : "away";
    }

    const scoreBefore = { ...score };
    score[pointWinner] += 1;
    const result: IaRallyResult = {
      rallyId: rally.id,
      number: index + 1,
      servingTeam,
      server: lineup[servingTeam].positions["1"],
      lineup: { home: cloneLineup(lineup.home), away: cloneLineup(lineup.away) },
      pointWinner,
      pointGuessed,
      scoreBefore,
      scoreAfter: { ...score },
    };
    results.push(result);
    timeline.push({ kind: "rally", result });
    // サイドアウトなら、点を取った(サーブ権を取った)チームがすぐにローテーションする。
    // バレーステーションも同じで、ラリーの間の交代・タイムアウトの並びは、ローテーションしたあとのもの。
    if (pointWinner !== servingTeam) {
      lineup[pointWinner] = rotateLineup(lineup[pointWinner]);
    }
  });
  applySubstitutionsBefore(Number.POSITIVE_INFINITY);

  const requiredRallies = hasFinalScore(set) ? set.finalScore.home + set.finalScore.away : null;
  return {
    rallies: results,
    byRallyId: new Map(results.map((result) => [result.rallyId, result])),
    timeline,
    score: { ...score },
    requiredRallies,
    countedRallies: results.length,
    undecidedRallies: set.rallies.filter((rally) => rally.status === "rally" && rally.side === null).length,
    countMatches: requiredRallies === null ? null : requiredRallies === results.length,
    scoreMatches: hasFinalScore(set)
      ? score.home === set.finalScore.home && score.away === set.finalScore.away
      : null,
  };
}

/** ローテーションの呼び方(セッターの位置。S1〜S6)。 */
export function formatRotation(lineup: IaLineup): string {
  return `S${lineup.setterAt}`;
}
