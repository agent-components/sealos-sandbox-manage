import { cn } from "@/lib/cn";

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={cn(large ? "space-y-5" : "flex items-center gap-2.5")}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "inline-block rounded-full bg-brand",
            large ? "h-3 w-3 ring-6 ring-brand-soft" : "h-2 w-2",
          )}
        />
        <p
          className={cn(
            "font-semibold tracking-[-0.04em] text-ink",
            large ? "text-6xl sm:text-7xl" : "text-lg",
          )}
        >
          boat
        </p>
      </div>
      {large ? (
        <p className="max-w-md text-base leading-relaxed text-muted sm:text-lg">
          几秒拉起一台云端沙箱，公网直连，按需启停。
        </p>
      ) : null}
    </div>
  );
}
