"use client";

import { IA_RATES } from "@/components/input-assist/use-playback-rate";

/** 再生の速さのボタン(0.5〜2倍)。 */
export function IaRateButtons({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  return (
    <span className="ia-rates" role="group" aria-label="再生の速さ">
      {IA_RATES.map((value) => (
        <button
          type="button"
          key={value}
          className={`ia-rate ${rate === value ? "ia-rate-active" : ""}`}
          aria-pressed={rate === value}
          onClick={() => onChange(value)}
        >
          {value}倍
        </button>
      ))}
    </span>
  );
}
