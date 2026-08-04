import { MultiMatchAnalysisClient } from "@/components/multi-match-analysis-client";
import { formatTeamSlugLabel } from "@/lib/domain/team";
import {
  getSavedWorkspace,
  listSavedWorkspaces,
} from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamAnalysisPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const summaries = (await listSavedWorkspaces()).filter(
    (workspace) => workspace.teamSlug === teamSlug,
  );
  const teamName =
    summaries.find((workspace) => workspace.teamName)?.teamName ??
    formatTeamSlugLabel(teamSlug) ??
    teamSlug;

  const records = await Promise.all(
    summaries.map(async (summary) => ({
      summary,
      record: await getSavedWorkspace(summary.id),
    })),
  );

  const candidates = records.flatMap(({ summary, record }) => {
    if (!record) {
      return [];
    }

    const match = record.collection.matches[record.selectedMatchIndex];
    if (!match) {
      return [];
    }

    return [
      {
        id: record.id,
        name: record.name,
        matchLabel: summary.matchLabel,
        resultLabel: summary.resultLabel,
        setScoreLabel: summary.setScoreLabel,
        createdAt: record.createdAt,
        match,
      },
    ];
  });

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>総合分析</h1>
            <p>
              対象チームを選択し、そのチームが出場した試合を複数選択して統計をまとめて確認します。
            </p>
          </div>
          <div className="meta-grid workspaces-meta-grid">
            <div className="meta-card">
              <span className="muted">対象試合</span>
              <strong>{candidates.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">登録試合</span>
              <strong>{summaries.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <MultiMatchAnalysisClient candidates={candidates} teamName={teamName} />
    </main>
  );
}
