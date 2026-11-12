"use client";

import { useRouter } from "next/navigation";
import { useState, type PointerEvent } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  LIFT_LABELS,
  LOG_MAX_PAST_DAYS,
  addDays,
  formatMonthDay,
  type LiftHistoryPoint,
  type LiftKind,
} from "@/lib/domain/training";

type LiftHistoryProps = {
  history: Record<LiftKind, LiftHistoryPoint[]>;
  // 自分の記録のときだけ渡す:記録の一覧で「編集」「削除」ができる(2026-11-12 から)。
  edit?: { teamSlug: string; today: string };
};

const LIFTS: LiftKind[] = ["sq", "dl", "bp"];

// グラフの大きさ(viewBox。横幅は画面に合わせて伸び縮みする)。
const W = 320;
const H = 140;
const PAD = { top: 16, right: 14, bottom: 22, left: 34 };

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function formatDate(isoDate: string) {
  const [year] = isoDate.split("-");
  return `${year.slice(2)}/${formatMonthDay(isoDate)}`;
}

/** 日付を、1970-01-01 からの日数に(横軸を日付の間隔どおりにするため)。 */
function dayNumber(isoDate: string) {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;
}

/**
 * Big3 の推移(2026-11-12 から。けーいちの依頼)。種目ごとに1つずつ、推定1RM の折れ線を並べる。
 * 点を押す(なぞる)と、その日の記録が出る。更新した日の点は塗りつぶし、それ以外は白抜き。下に記録の一覧の表。
 * 自分の記録なら、一覧の「編集」で日付・重さ・RM を直し、「削除」で消せる(日付を選べるようになる前の記録は保存した日で入っているため)。
 */
export function LiftHistory({ history, edit }: LiftHistoryProps) {
  const total = LIFTS.reduce((sum, lift) => sum + history[lift].length, 0);
  if (total === 0) {
    return <p className="tp-small tp-muted">まだ記録はありません。トレ録の「測定の記録」で入れると、ここに推移が出ます。</p>;
  }
  return (
    <div className="tp-lift-history">
      <div className="tp-lift-charts">
        {LIFTS.map((lift) => (
          <LiftChart key={lift} lift={lift} points={history[lift]} />
        ))}
      </div>
      <details className="tp-card">
        <summary className="tp-small">記録の一覧{edit ? "(編集・削除はここから)" : ""}</summary>
        {/* スマホの幅で横にはみ出さないよう、表ではなく1件1行の一覧にした(編集の欄もその下に開く) */}
        <ol className="tp-lift-records">
            {LIFTS.flatMap((lift) => history[lift].map((point) => ({ lift, point })))
              .sort((a, b) => b.point.date.localeCompare(a.point.date) || LIFTS.indexOf(a.lift) - LIFTS.indexOf(b.lift))
              .map(({ lift, point }) => (
                <RecordRow key={`${lift}-${point.date}`} lift={lift} point={point} edit={edit} />
              ))}
        </ol>
      </details>
    </div>
  );
}

function RecordRow({
  lift,
  point,
  edit,
}: {
  lift: LiftKind;
  point: LiftHistoryPoint;
  edit?: { teamSlug: string; today: string };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [date, setDate] = useState(point.date);
  const [value, setValue] = useState(String(point.value));
  const [rm, setRm] = useState(point.rm === 1 ? "1" : "3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open(next: "edit" | "delete") {
    setDate(point.date);
    setValue(String(point.value));
    setRm(point.rm === 1 ? "1" : "3");
    setError("");
    setMode(next);
  }

  async function send(method: "PATCH" | "DELETE") {
    if (!edit) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/measurements", edit.teamSlug), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          method === "PATCH"
            ? { item: lift, date: point.date, newDate: date, value, rm }
            : { item: lift, date: point.date },
        ),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      setMode("view");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <div className="tp-lift-record">
        <span>
          <b>{formatDate(point.date)}</b> {LIFT_LABELS[lift]}
        </span>
        <span className="tp-num">
          {point.rm === 1 ? "1RM" : "3RM"} {point.value} kg
          <small className="tp-muted">
            {" "}
            → 推定 {round1(point.estimated)} kg{point.isBest ? " ・ 更新" : ""}
          </small>
        </span>
        {edit ? (
          <span className="tp-lift-record-actions">
            <button type="button" className="tp-link-button" onClick={() => open("edit")}>
              編集
            </button>
            <button type="button" className="tp-link-button tp-danger-text" onClick={() => open("delete")}>
              削除
            </button>
          </span>
        ) : null}
      </div>
      {edit && mode !== "view" ? (
        <div className="tp-lift-edit">
            {mode === "edit" ? (
              <div className="tp-lift-edit">
                <div className="tp-inputs">
                  <div className="tp-field">
                    <label htmlFor={`lift-date-${lift}-${point.date}`}>測った日</label>
                    <input
                      id={`lift-date-${lift}-${point.date}`}
                      type="date"
                      min={addDays(edit.today, -LOG_MAX_PAST_DAYS)}
                      max={edit.today}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </div>
                  <div className="tp-field">
                    <label htmlFor={`lift-value-${lift}-${point.date}`}>{LIFT_LABELS[lift]}(kg)</label>
                    <div className="tp-rm">
                      <input
                        id={`lift-value-${lift}-${point.date}`}
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                      />
                      <select aria-label="何回挙げた重さか" value={rm} onChange={(event) => setRm(event.target.value)}>
                        <option value="3">3RM</option>
                        <option value="1">1RM</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="tp-actions">
                  <button
                    type="button"
                    className="tp-button"
                    disabled={busy || !date || !value.trim()}
                    onClick={() => void send("PATCH")}
                  >
                    {busy ? "保存中…" : "保存"}
                  </button>
                  <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={() => setMode("view")}>
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <div className="tp-lift-edit">
                <p className="tp-small">
                  {formatDate(point.date)} の{LIFT_LABELS[lift]}({point.rm === 1 ? "1RM" : "3RM"} {point.value} kg)を削除します。元に戻せません。
                </p>
                <div className="tp-actions">
                  <button type="button" className="tp-button tp-danger" disabled={busy} onClick={() => void send("DELETE")}>
                    {busy ? "削除中…" : "削除する"}
                  </button>
                  <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={() => setMode("view")}>
                    やめる
                  </button>
                </div>
              </div>
            )}
            {error ? (
              <p className="tp-error" role="alert">
                {error}
              </p>
            ) : null}
        </div>
      ) : null}
    </li>
  );
}

function LiftChart({ lift, points }: { lift: LiftKind; points: LiftHistoryPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return (
      <figure className="tp-card tp-lift-chart">
        <figcaption>
          <b>{LIFT_LABELS[lift]}</b>
          <span className="tp-small tp-muted">まだ記録はありません</span>
        </figcaption>
      </figure>
    );
  }

  const values = points.map((point) => point.estimated);
  // 縦軸は 10kg 刻みに丸め、点が上下の端に張りつかないよう少し余白を取る。
  const low = Math.floor((Math.min(...values) - 5) / 10) * 10;
  const high = Math.max(Math.ceil((Math.max(...values) + 5) / 10) * 10, low + 10);
  const start = dayNumber(first.date);
  const span = Math.max(dayNumber(last.date) - start, 1);
  const x = (point: LiftHistoryPoint) =>
    points.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((dayNumber(point.date) - start) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - low) / (high - low)) * (H - PAD.top - PAD.bottom);
  const gain = round1(last.estimated - first.estimated);
  const shown = active === null ? null : points[active];

  function pick(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(x(point) - px) < Math.abs(x(points[nearest]) - px)) {
        nearest = index;
      }
    });
    setActive(nearest);
  }

  return (
    <figure className="tp-card tp-lift-chart">
      <figcaption>
        <b>{LIFT_LABELS[lift]}</b>
        <span className="tp-lift-now">
          {round1(last.estimated)} kg <small className="tp-muted">推定1RM</small>
        </span>
        <span className="tp-small tp-muted">
          {points.length > 1
            ? `${formatDate(first.date)} から ${gain >= 0 ? "+" : ""}${gain} kg ・ ${points.length}回`
            : `${formatDate(first.date)} ・ 1回`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${LIFT_LABELS[lift]}の推定1RMの推移。${formatDate(first.date)} ${round1(first.estimated)}kg から ${formatDate(last.date)} ${round1(last.estimated)}kg`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
      >
        {[low, (low + high) / 2, high].map((value) => (
          <g key={value} className="tp-lift-grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} />
            <text x={PAD.left - 6} y={y(value)} dy="0.35em" textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        <text className="tp-lift-axis" x={PAD.left} y={H - 6} textAnchor="start">
          {formatDate(first.date)}
        </text>
        {points.length > 1 ? (
          <text className="tp-lift-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
            {formatDate(last.date)}
          </text>
        ) : null}
        {shown ? <line className="tp-lift-cross" x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={H - PAD.bottom} /> : null}
        {points.length > 1 ? (
          <polyline className="tp-lift-line" points={points.map((point) => `${x(point)},${y(point.estimated)}`).join(" ")} />
        ) : null}
        {points.map((point, index) => (
          <circle
            key={point.date}
            className={point.isBest ? "tp-lift-dot tp-lift-best" : "tp-lift-dot"}
            cx={x(point)}
            cy={y(point.estimated)}
            r={index === active ? 6 : 4}
          />
        ))}
      </svg>
      <p className="tp-small tp-lift-tip" aria-live="polite">
        {shown ? (
          <>
            <b>{formatDate(shown.date)}</b> {shown.rm === 1 ? "1RM" : "3RM"} {shown.value} kg ・ 推定1RM {round1(shown.estimated)} kg
            {shown.isBest ? " ・ 更新" : ""}
          </>
        ) : (
          <span className="tp-muted">点を押すと、その日の記録が出ます(●は更新した日)</span>
        )}
      </p>
    </figure>
  );
}
