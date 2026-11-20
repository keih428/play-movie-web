"use client";

import { useRef, useState } from "react";
import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, findYouTubeIds } from "@/lib/domain/note-media";
import { buildTeamApiPath } from "@/lib/domain/team";

/**
 * ノート・コメントの写真と動画(2026-11-20 から)。写真は押すと大きく開く。
 * 動画は本文に貼った YouTube の URL を、その下で再生できるように並べる(限定公開の動画を貼ってもらう)。
 */
export function NoteMedia({
  photoIds,
  texts,
  teamSlug,
}: {
  photoIds: string[];
  texts: string[];
  teamSlug: string;
}) {
  const videoIds = findYouTubeIds(...texts);
  if (photoIds.length === 0 && videoIds.length === 0) {
    return null;
  }
  return (
    <div className="tp-media">
      {photoIds.length > 0 ? (
        <div className="tp-media-photos">
          {photoIds.map((id) => {
            const src = buildTeamApiPath(`/api/portal/photos/${id}`, teamSlug);
            return (
              <a key={id} href={src} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- ログインが要る写真なので、画像の最適化は通さない */}
                <img src={src} alt="添付の写真" loading="lazy" />
              </a>
            );
          })}
        </div>
      ) : null}
      {videoIds.map((id) => (
        <div key={id} className="tp-media-video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title="添付の動画"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ))}
    </div>
  );
}

/** 写真を端末で縮める(長い辺を PHOTO_MAX_EDGE まで、JPEG)。読めない形式なら、そのまま返す。 */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * 写真を選んで上げる欄。選んだらすぐ1枚ずつ上げ、上がった写真の ID を親に渡す(保存は親のボタンで)。
 * 数に上限はない(けーいち、2026-11-20)。× で外せる。
 */
export function PhotoPicker({
  photoIds,
  onChange,
  teamSlug,
  onBusyChange,
}: {
  photoIds: string[];
  onChange: (ids: string[]) => void;
  teamSlug: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) {
      return;
    }
    setError("");
    setUploading(list.length);
    onBusyChange?.(true);
    let ids = photoIds;
    let failed = 0;
    for (const file of list) {
      try {
        const blob = await shrinkPhoto(file);
        if (blob.size > PHOTO_MAX_BYTES) {
          throw new Error("too large");
        }
        const form = new FormData();
        form.append("file", blob, file.name);
        const response = await fetch(buildTeamApiPath("/api/portal/photos", teamSlug), { method: "POST", body: form });
        const payload = (await response.json().catch(() => ({}))) as { id?: string };
        if (!response.ok || !payload.id) {
          throw new Error("upload failed");
        }
        ids = [...ids, payload.id];
        onChange(ids);
      } catch {
        failed += 1;
      }
      setUploading((count) => count - 1);
    }
    onBusyChange?.(false);
    if (failed > 0) {
      setError(`${failed}枚を上げられませんでした。もう一度選んでください。`);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="tp-photopicker">
      {photoIds.length > 0 ? (
        <div className="tp-media-photos">
          {photoIds.map((id) => (
            <span key={id} className="tp-photopicker-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- ログインが要る写真なので、画像の最適化は通さない */}
              <img src={buildTeamApiPath(`/api/portal/photos/${id}`, teamSlug)} alt="付ける写真" />
              <button
                type="button"
                aria-label="この写真を外す"
                onClick={() => onChange(photoIds.filter((entry) => entry !== id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <label className="tp-mini tp-photopicker-add">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={uploading > 0}
          onChange={(event) => void upload(event.target.files)}
        />
        {uploading > 0 ? `写真を上げています…(残り ${uploading}枚)` : "＋ 写真を付ける"}
      </label>
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
