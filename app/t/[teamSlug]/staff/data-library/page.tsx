import { ScoutFileLibraryClient } from "@/components/scout-file-library-client";
import { formatTeamSlugLabel } from "@/lib/domain/team";
import { getScoutFileLibrary } from "@/lib/server/app-settings-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamStaffDataLibraryPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const library = await getScoutFileLibrary(teamSlug);

  return (
    <ScoutFileLibraryClient
      initialLibrary={library}
      teamName={formatTeamSlugLabel(teamSlug)}
      teamSlug={teamSlug}
    />
  );
}
