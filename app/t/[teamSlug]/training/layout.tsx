import { TrainingTopNav } from "@/components/training-top-nav";
import "./training.css";

// 配布版(鉄壁トレーニング)と同じ文字。日本語の書体はビルドに取り込むと数百ファイルになるので、
// Google Fonts から、表示に要る分だけをブラウザに読ませる。
const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;600&display=swap";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    teamSlug: string;
  }>;
};

export default async function TrainingLayout({ children, params }: LayoutProps) {
  const { teamSlug } = await params;

  return (
    <div className="tp">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONT_STYLESHEET} precedence="default" />
      <div className="tp-wrap">
        <TrainingTopNav teamSlug={teamSlug} />
        {children}
      </div>
    </div>
  );
}
