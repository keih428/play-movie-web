# バレーボール ビデオスカウティングWebアプリ 仕様書

## 1. プロジェクト概要
バレーボールのスタッツ・分析ソフト（VolleyStation等）から出力される`.vsm`ファイルを読み込み、アップロードされた試合映像（YouTube）と同期させることで、特定のラリーやプレイを簡単に振り返ることができるWebアプリケーション。

## 2. システム構成（技術スタック）
*   **フロントエンド:** Next.js (React), TypeScript
*   **バックエンド (API):** Next.js API Routes (Serverless Functions)
*   **動画ホスティング:** YouTube (限定公開を利用)
*   **動画制御:** YouTube IFrame Player API (または `react-youtube` 等のラッパーライブラリ)
*   **ファイルストレージ:** Vercel Blob (無料枠を利用)
*   **ホスティング環境:** Vercel

## 3. コア機能要件

### 3.1 ファイルアップロード・解析機能
*   ユーザーがブラウザから `.vsm` ファイルを選択し、Vercel Blobへアップロードする。
*   アップロードされたファイルをバックエンドで解析し、プレイごとのメタデータ（アクション種類、選手、評価）と**動画タイムスタンプ（秒数）**を抽出する。

### 3.2 YouTube動画同期（シンクロ）機能
*   **オフセット設定:** 実際のYouTube動画の開始位置と、`.vsm`データの記録開始位置（0秒地点）の「ズレ」をユーザーが手動で設定できる機能。
*   **プリロール（Pre-roll）再生:** 記録されたジャストの秒数ではなく、プレイの助走や状況を把握できるよう、設定した秒数（例: 3〜5秒前）から再生を開始する機能。

### 3.3 ラリー閲覧・フィルタリング機能
*   解析されたデータをもとに、試合中のラリーやアクションをリスト表示する。
*   特定の選手、特定のアクション（スパイク、ブロック等）、またはラリーの勝敗などでリストをフィルタリングできる。
*   リスト内の項目をクリックすると、連携したYouTubeプレーヤーが該当のタイムスタンプへ自動でシーク（移動）し、再生を開始する。

## 4. データ連携と同期ロジック

動画の再生位置を決定するための計算式は以下の通りとする。

**再生位置(秒) = vsmデータのタイムスタンプ(秒) + オフセット(秒) - プリロール(秒)**

*   **vsmデータのタイムスタンプ:** ファイル解析により抽出されたアクション発生時刻。
*   **オフセット:** ユーザーが画面上で指定する動画とデータの差分時間。
*   **プリロール:** プレイ発生の数秒前から再生するための固定値（ユーザー設定可能が望ましい）。

## 5. 画面構成（UI/UX設計）

1.  **設定パネル (Setup Area)**
    *   `.vsm` ファイルアップロード用フォーム
    *   YouTube動画のURL入力フィールド
    *   オフセット時間設定ボタン（「現在の再生位置を動画開始の0秒に設定する」ボタン等）
2.  **ビデオプレーヤー領域 (Video Player Area)**
    *   YouTube IFrame Playerの埋め込み
    *   再生・一時停止などの基本コントロール
3.  **プレイリストパネル (Play-by-Play Panel)**
    *   抽出されたラリーの一覧表示
    *   選手名、アクション種別ごとの絞り込み（フィルター）UI

## 6. インフラとデータフロー（フェーズ1）

初期開発（MVP）フェーズにおけるデータの流れは以下を想定する。

1.  ユーザーがWeb UIから `.vsm` ファイルとYouTube URLを指定。
2.  Next.js APIを経由して、`.vsm` ファイルを **Vercel Blob** へアップロード。
3.  ファイルのアップロード完了と同時にデータを解析（パース）し、JSON形式でフロントエンドへ返す。
4.  フロントエンドは受け取ったJSONデータをもとにリストを生成し、YouTube APIと連動して動画のシーク制御を行う。

*(※将来的にチーム共有機能などを実装する場合は、データベース（Vercel Postgres等）を導入し、動画URLやオフセット設定などのメタデータを永続化するフェーズ2へ移行する。)*

## 7. 開発方針
本アプリは、以下の2つを疎結合に実装する。

1.  **試合データ解析レイヤ**
    *   `.vsm` / `.vsdb` を読み込み、試合・セット・イベント・プレイ単位の正規化済みJSONへ変換する。
    *   動画同期に必要な `time` / `originalTime`、プレイ一覧、スコア推移、ローテーション情報を抽出する。
2.  **動画同期・分析UIレイヤ**
    *   正規化済みJSONを表示し、YouTubeプレーヤーとの同期、フィルタ、分析表示を行う。

この分離により、動画UIの変更とデータ解析ロジックの変更を独立して進められるようにする。

## 8. データモデル方針
サンプルデータの確認結果として、今回扱う `.vsm` / `.vsdb` は実体がJSONであり、`.vsdb` の `matches[*]` は `.vsm` とほぼ同型である。よって、アプリ内部では以下のような共通構造へ正規化する。

*   `Match`
    *   試合単位のメタデータ、チーム情報、セット一覧を持つ
*   `Set`
    *   セット番号、最終スコア、イベント一覧を持つ
*   `Event`
    *   ラリー進行中のスコア、ポイント結果、プレイ一覧を持つ
*   `Play`
    *   `team`, `player`, `skill`, `effect`, `code`, `time`, `originalTime` などを持つ
*   `Lineup`
    *   各イベント時点の `positions` と `setterAt` を持つ
*   `VideoSyncSettings`
    *   `youtubeUrl`, `offset`, `preroll` を持つ

MVPでは動画同期計算に `time` を採用し、必要であれば将来的に `originalTime` への切替を可能にする。

## 9. 推奨ディレクトリ構成
実装時の責務分離を明確にするため、以下のような構成を想定する。

```txt
play-movie-web/
  app/
    api/
      parse/
        route.ts
    page.tsx
  components/
    setup-panel.tsx
    video-player.tsx
    play-list.tsx
    filters.tsx
    charts/
      score-timeline.tsx
  lib/
    parsers/
      vsm.ts
      vsdb.ts
    domain/
      normalize.ts
      video.ts
      types.ts
```

## 10. 開発ロードマップ

### フェーズ1: 解析基盤の構築
1.  Next.js + TypeScript のプロジェクトを初期化する
2.  `.vsm` パーサを実装する
3.  `.vsdb` パーサを実装する
4.  共通の正規化関数を実装する
5.  `POST /api/parse` を実装し、アップロードされたファイルを解析してJSONを返す

### フェーズ2: 動画同期MVPの構築
1.  `.vsm` / `.vsdb` アップロードUIを作る
2.  YouTube URL 入力UIを作る
3.  `offset` / `preroll` 設定UIを作る
4.  YouTubeプレーヤーを埋め込む
5.  プレイ一覧を表示する
6.  プレイクリックで該当シーンへシーク再生できるようにする

### フェーズ3: 分析UIの追加
1.  チーム・選手・スキルによるフィルタ機能を追加する
2.  スキル別件数集計を表示する
3.  セットごとの得点推移を表示する
4.  基本KPIを表示する

### フェーズ4: 拡張機能
1.  `lineup.positions` を展開し、ローテーション解析を追加する
2.  Vercel Blob に元ファイルを保存する
3.  解析済みJSONや動画設定の永続化を検討する
4.  必要に応じて Vercel Postgres 等を導入し、チーム共有を可能にする

## 11. MVPの完了条件
以下を満たした時点をMVP完了とする。

*   `.vsm` ファイルをアップロードできる
*   解析済みプレイ一覧を表示できる
*   YouTube URL を設定できる
*   `offset` / `preroll` を設定できる
*   プレイをクリックすると対応する動画位置へシークできる
*   選手名またはスキルでプレイを絞り込める

## 12. 実装時の重要論点
開発初期に以下を明確化する。

*   動画同期の基準時刻として `time` と `originalTime` のどちらを採用するか
*   `.vsdb` 取り込み時に複数試合をどう切り替えるか
*   解析結果を毎回生成するか、一度保存して再利用するか
*   MVP段階から Vercel Blob を使うか、まずは一時アップロードで進めるか

## 13. 開発タスク一覧
Issue化する場合は、以下の単位で切ると進めやすい。

1.  プロジェクト初期化
2.  型定義とドメインモデル設計
3.  `.vsm` パーサ実装
4.  `.vsdb` パーサ実装
5.  正規化関数実装
6.  解析API実装
7.  セットアップ画面実装
8.  YouTubeプレーヤー連携
9.  プレイ一覧UI実装
10. フィルタ機能実装
11. 分析パネル実装
12. ローテーション解析実装
13. Blob保存対応
14. DB永続化対応
15. テスト整備
16. Vercelデプロイ

## 14. ストレージ切替
現在の実装では、ワークスペース保存先を環境変数で切り替えられる。

*   `WORKSPACE_STORE_PROVIDER=local`
    *   `.data/workspaces` 配下の JSON ファイルへ保存する
    *   ローカル開発向け
*   `WORKSPACE_STORE_PROVIDER=vercel-blob`
    *   `@vercel/blob` を使って `workspaces/*.json` として保存する
    *   `BLOB_READ_WRITE_TOKEN` の設定が必要

`WORKSPACE_STORE_PROVIDER` が未設定でも、`BLOB_READ_WRITE_TOKEN` が存在すれば `vercel-blob` を優先し、なければ `local` を使う。

## 15. 環境変数
`.env.example` を `.env.local` としてコピーし、必要な値を設定する。

```bash
cp .env.example .env.local
```

### ローカル開発
ローカル JSON 保存を使う場合:

```env
WORKSPACE_STORE_PROVIDER=local
```

Vercel Blob をローカルで試す場合:

```env
WORKSPACE_STORE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=your_token_here
```

### Vercel 本番
Vercel の Project Settings > Environment Variables に以下を設定する。

*   `WORKSPACE_STORE_PROVIDER=vercel-blob`
*   `BLOB_READ_WRITE_TOKEN=...`

この設定で、ワークスペース保存 API は自動的に Vercel Blob を使う。

## 16. 本番移行メモ
本番運用で共有URLを安定させるには、少なくとも以下を満たす。

1.  Vercel にデプロイする
2.  `BLOB_READ_WRITE_TOKEN` を設定する
3.  `WORKSPACE_STORE_PROVIDER=vercel-blob` を設定する
4.  サーバー保存したワークスペースを `/?workspaceId=...` で開けることを確認する

将来的に更新競合や検索機能が必要になった場合は、保存先を Vercel Postgres 等へ移行する。
