"use client";

import { useState } from "react";

type CopyShareLinkButtonProps = {
  workspaceId: string;
};

export function CopyShareLinkButton({
  workspaceId,
}: CopyShareLinkButtonProps) {
  const [status, setStatus] = useState("Copy Share URL");

  async function handleCopy() {
    try {
      const url = new URL(window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      await navigator.clipboard.writeText(url.toString());
      setStatus("Copied");
    } catch {
      setStatus("Copy Failed");
    }
  }

  return (
    <button className="badge badge-link badge-button" type="button" onClick={handleCopy}>
      {status}
    </button>
  );
}
