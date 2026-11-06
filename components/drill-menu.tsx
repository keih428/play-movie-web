"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreMenu } from "@/components/more-menu";
import { buildTeamApiPath, buildTeamStatsPath } from "@/lib/domain/team";

type DrillMenuProps = {
  teamSlug: string;
  drillId: string;
  // 消したあとに戻る、一覧のタブ。
  backTab: string;
};

/**
 * 集計ページの見出しの右上の「⋯」。「このメニューを消す」はここに入れる
 * (2026-11-06 から。記録の画面に出したままだと、押しまちがえやすかった)。
 */
export function DrillMenu({ teamSlug, drillId, backTab }: DrillMenuProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function removeDrill() {
    if (deleting) {
      return;
    }
    if (!window.confirm("このメニューと、数えた本数をすべて消します。元に戻せません。")) {
      return;
    }
    setDeleting(true);
    setError("");
    const response = await fetch(buildTeamApiPath(`/api/portal/drill-stats/${drillId}`, teamSlug), {
      method: "DELETE",
    });
    if (response.ok) {
      router.push(`${buildTeamStatsPath(teamSlug)}?tab=${backTab}`);
      router.refresh();
    } else {
      setDeleting(false);
      setError("消せませんでした。");
    }
  }

  return (
    <>
      <MoreMenu
        label="このメニューの操作"
        items={[{ label: deleting ? "消しています…" : "このメニューを消す", onSelect: () => void removeDrill() }]}
      />
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
