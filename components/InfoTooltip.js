'use client';

// InfoTooltip.js — a small (i) icon that reveals a plain-English explanation on
// hover/focus. Used across the dashboard to explain technical terms (e.g. "waste
// ratio", "share of sales") to non-technical restaurant owners.
import { Info } from 'lucide-react';

// Small (i) marker that reveals a plain-English explanation on hover/focus.
export default function InfoTooltip({ text, size = 13, className = '' }) {
  return (
    <span className={'relative inline-flex group align-middle ' + className}>
      <button
        type="button"
        aria-label="More information"
        className="text-muted hover:text-ink transition-colors cursor-help"
      >
        <Info size={size} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 bg-ink text-white text-[11.5px] font-normal leading-snug rounded-lg px-3 py-2 shadow-pop text-left normal-case tracking-normal"
      >
        {text}
      </span>
    </span>
  );
}
