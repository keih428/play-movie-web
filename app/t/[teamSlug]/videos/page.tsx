import { VideoLibraryClient } from "@/components/video-library-client";
import { formatTeamSlugLabel } from "@/lib/domain/team";
import { getLatestVideoLibraryLink, getVideoLibrary } from "@/lib/server/app-settings-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamVideosPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const library = await getVideoLibrary(teamSlug);
  const latestLink = await getLatestVideoLibraryLink(teamSlug);

  return (
    <VideoLibraryClient
      initialLibrary={library}
      initialLatestCreatedAt={latestLink?.createdAt}
      teamName={formatTeamSlugLabel(teamSlug)}
      teamSlug={teamSlug}
    />
  );
}
