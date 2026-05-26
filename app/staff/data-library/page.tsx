import Link from "next/link";

export const metadata = {
  title: "試合データ管理 | バレーボール 試合ビューア",
};

export const dynamic = "force-dynamic";

export default function StaffDataLibraryPage() {
  return (
    <main className="page-shell">
      <section className="panel">
        <div className="panel-inner stack">
          <div>
            <h2>チーム別ページを使ってください</h2>
            <p className="muted">
              試合データ管理はチームごとに分かれています。`/t/[teamSlug]/staff/data-library`
              の形式で開いてください。
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/">
              ホームへ戻る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
