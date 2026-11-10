"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/components/input-assist/ia-utils";
import {
  CELL_STATUS_LABELS,
  PASS_LABELS,
  buildBoard,
  buildProgress,
  formatAgo,
  isHeldByOther,
  type IaAssignment,
  type IaBoardCell,
  type IaPassSeconds,
} from "@/lib/domain/input-assist/board";
import { IA_PASSES } from "@/lib/domain/input-assist/collab";
import type { IaPassName, InputAssistSession } from "@/lib/domain/input-assist/types";

// 担当の表:セット × パス(P0〜P4)。だれが打っているか・進み具合・始めてよいか。
// マスを押すと、そのセットのそのパスを開く。

type Action = "claim" | "release" | "done" | "reopen";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function IaAssignmentBoard({
  session,
  assignments,
  passSeconds,
  memberId,
  activeSetIndex,
  activePass,
  onOpen,
  onAction,
}: {
  session: Pick<InputAssistSession, "sets" | "extras">;
  assignments: IaAssignment[];
  passSeconds: IaPassSeconds[];
  memberId: string;
  activeSetIndex?: number;
  activePass: IaPassName | null;
  onOpen: (setIndex: number, pass: IaPassName) => void;
  onAction: (action: Action, setIndex: number, pass: IaPassName, force?: boolean) => void;
}) {
  const now = useNow(15 * 1000);
  // 進み具合は中身が変わったときだけ数え直す。打っている間は後回しにする(キーを押したときに重くしない)
  const sets = useDeferredValue(session.sets);
  const extras = session.extras;
  const progress = useMemo(() => buildProgress(sets, extras), [sets, extras]);
  const rows = useMemo(
    () => buildBoard({ sets, extras }, assignments, passSeconds, now, progress),
    [sets, extras, assignments, passSeconds, now, progress],
  );
  const [open, setOpen] = useState(true);
  if (rows.length === 0) {
    return null;
  }

  function claim(cell: IaBoardCell) {
    const holder = cell.assignment;
    if (isHeldByOther(holder, memberId, Date.now())) {
      if (!window.confirm(`${holder?.holderName ?? "ほかの人"}さんが担当しています。引き継ぎますか?`)) {
        return;
      }
      onAction("claim", cell.setIndex, cell.pass, true);
      return;
    }
    if (cell.assignment?.done) {
      onAction("reopen", cell.setIndex, cell.pass);
    }
    onAction("claim", cell.setIndex, cell.pass);
  }

  return (
    <details className="ia-board" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>担当の表</summary>
      <div className="ia-board-scroll">
        <table className="ia-board-table">
          <thead>
            <tr>
              <th scope="col">セット</th>
              {IA_PASSES.map((pass) => (
                <th scope="col" key={pass}>
                  {pass} {PASS_LABELS[pass]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.setIndex}>
                <th scope="row">{row.setIndex}</th>
                {row.cells.map((cell) => {
                  const holder = cell.assignment;
                  const mine = holder?.holderId === memberId;
                  const active = cell.setIndex === activeSetIndex && cell.pass === activePass;
                  return (
                    <td
                      key={cell.pass}
                      className={[
                        "ia-board-cell",
                        `ia-board-${cell.status}`,
                        active ? "ia-board-active" : "",
                        !cell.readiness.ready ? "ia-board-wait" : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="ia-board-open"
                        onClick={() => onOpen(cell.setIndex, cell.pass)}
                        title="このパスを開く"
                      >
                        <span className="ia-board-status">{CELL_STATUS_LABELS[cell.status]}</span>
                        <span className="ia-board-progress">{cell.progress.text}</span>
                      </button>
                      {holder?.holderName ? (
                        <span className={`ia-board-holder ${cell.stale ? "ia-board-stale" : ""}`}>
                          {mine ? "自分" : holder.holderName}
                          {holder.heartbeatAt ? `・${formatAgo(holder.heartbeatAt, now)}` : ""}
                          {cell.stale ? "(止まっている)" : ""}
                        </span>
                      ) : cell.assignment?.done && cell.assignment.doneByName ? (
                        <span className="ia-board-holder">{cell.assignment.doneByName}</span>
                      ) : null}
                      {cell.readiness.hint ? <span className="ia-board-hint">{cell.readiness.hint}</span> : null}
                      {cell.seconds > 0 ? <span className="ia-board-hint">{formatDuration(cell.seconds)}</span> : null}
                      <span className="ia-board-actions">
                        {!mine ? (
                          <button type="button" onClick={() => claim(cell)}>
                            担当する
                          </button>
                        ) : (
                          <button type="button" onClick={() => onAction("release", cell.setIndex, cell.pass)}>
                            外す
                          </button>
                        )}
                        {cell.assignment?.done ? (
                          <button type="button" onClick={() => onAction("reopen", cell.setIndex, cell.pass)}>
                            完了を取り消す
                          </button>
                        ) : (
                          <button type="button" onClick={() => onAction("done", cell.setIndex, cell.pass)}>
                            完了にする
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
