/** Lightweight CSS-only tooltip — appears instantly on hover, no JS timers. */
export default function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--button-dark-bg)]/90 px-2 py-1 text-[11px] text-[var(--button-primary-text)] opacity-0 transition-opacity group-hover/tip:opacity-100">
        {label}
      </span>
    </span>
  );
}
