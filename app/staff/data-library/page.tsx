import { ScoutFileLibraryClient } from "@/components/scout-file-library-client";
import { getScoutFileLibrary } from "@/lib/server/app-settings-store";

export const metadata = {
  title: "試合データ管理 | 東大バレー部 試合ビューア",
};

export default async function StaffDataLibraryPage() {
  const library = await getScoutFileLibrary();

  return <ScoutFileLibraryClient initialLibrary={library} />;
}
