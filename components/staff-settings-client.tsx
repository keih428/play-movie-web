"use client";

import { useState } from "react";
import type { SavedWorkspaceSummary, StaffAppSettings } from "@/lib/domain/types";

type StaffSettingsClientProps = {
  initialSettings: StaffAppSettings;
  workspaces: SavedWorkspaceSummary[];
};

export function StaffSettingsClient({
  initialSettings,
  workspaces,
}: StaffSettingsClientProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    initialSettings.defaultWorkspaceId ?? "",
  );
  const [landingMessage, setLandingMessage] = useState(
    initialSettings.landingMessage ?? "",
  );
  const [status, setStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    setStatus(undefined);

    const selectedWorkspace = workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    );

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          defaultWorkspaceId: selectedWorkspaceId || undefined,
          defaultWorkspaceName: selectedWorkspace?.name,
          landingMessage: landingMessage.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("failed to save settings");
      }

      setStatus("スタッフ設定を保存しました。");
    } catch {
      setStatus("スタッフ設定の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>スタッフ公開設定</h2>
          <p className="muted">
            一般部員向けホームで公開する試合ワークスペースとメッセージをここで設定します。
          </p>
        </div>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>現在の試合</h3>
            <p className="muted">
              ホームで既定表示する保存済みワークスペースを選択します。
            </p>
          </div>

          <div className="field">
            <label htmlFor="default-workspace">公開ワークスペース</label>
            <select
              id="default-workspace"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            >
              <option value="">ワークスペースを選択</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} ({workspace.matchCount} matches)
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>ホーム文言</h3>
            <p className="muted">
              一般部員が最初に見るホームメッセージを任意で差し替えます。
            </p>
          </div>

          <div className="field">
            <label htmlFor="landing-message">ホームメッセージ</label>
            <textarea
              id="landing-message"
              rows={4}
              value={landingMessage}
              onChange={(event) => setLandingMessage(event.target.value)}
            />
          </div>
        </section>

        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            {isSaving ? "保存中..." : "公開設定を保存"}
          </button>
        </div>

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </section>
  );
}
