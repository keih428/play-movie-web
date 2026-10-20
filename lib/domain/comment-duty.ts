// コメント当番(けーいちの決定、2026-10-21):プレイヤーが毎週1人ずつ、ポジションに関係なく、ほかのプレイヤーのノートを受け持つ。
// 組み合わせは毎週ランダム。ただし前の週と同じ相手にはしない。全員が誰か1人を受け持ち、全員が誰か1人に受け持たれる。

export type CommentDutyPair = {
  commenterId: string;
  targetId: string;
};

/** その日が入る週の月曜('YYYY-MM-DD')。当番は月曜から日曜で回す(トレーニングの週と同じ)。 */
export function getDutyWeekStart(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/**
 * 今週の組み合わせを作る。ランダムに並べた輪で、隣の人を受け持つ(自分を受け持つことはない)。
 * 前の週と同じ組(受け持つ人 → 受け持たれる人)が出たら、並べ直す。何度やっても避けられないとき(人数が少ないなど)は、
 * いちばん重なりの少ない並びにする。
 */
export function buildCommentDuties(
  playerIds: string[],
  previous: CommentDutyPair[],
  random: () => number = Math.random,
  attempts = 200,
): CommentDutyPair[] {
  const ids = [...new Set(playerIds)];
  if (ids.length < 2) {
    return [];
  }
  const previousPairs = new Set(previous.map((pair) => `${pair.commenterId}>${pair.targetId}`));
  let best: CommentDutyPair[] = [];
  let bestRepeats = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const order = shuffle(ids, random);
    const pairs = order.map((commenterId, index) => ({
      commenterId,
      targetId: order[(index + 1) % order.length],
    }));
    const repeats = pairs.filter((pair) => previousPairs.has(`${pair.commenterId}>${pair.targetId}`)).length;
    if (repeats < bestRepeats) {
      best = pairs;
      bestRepeats = repeats;
    }
    if (repeats === 0) {
      break;
    }
  }
  return best;
}
