export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={large ? "space-y-4" : "flex items-center gap-2.5"}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={
            large
              ? "inline-block h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_0_6px_var(--accent-glow)]"
              : "inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
          }
        />
        <p
          className={
            large
              ? "text-6xl font-semibold tracking-[-0.04em] text-[var(--fg)] sm:text-7xl"
              : "text-lg font-semibold tracking-[-0.03em] text-[var(--fg)]"
          }
        >
          boat
        </p>
      </div>
      {large ? (
        <p className="max-w-md text-base leading-relaxed text-[var(--fg-muted)] sm:text-lg">
          几秒拉起一台云端沙箱，公网直连，按需启停。
        </p>
      ) : null}
    </div>
  );
}
