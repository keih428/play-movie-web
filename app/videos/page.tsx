import { VideoLibraryClient } from "@/components/video-library-client";
import { getVideoLibrary } from "@/lib/server/app-settings-store";

export const metadata = {
  title: "Video Library | Play Movie Web",
};

export default async function VideosPage() {
  const library = await getVideoLibrary();
  return <VideoLibraryClient initialLibrary={library} />;
}
