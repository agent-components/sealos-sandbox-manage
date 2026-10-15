"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  titleId?: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({
  title,
  titleId = "modal-title",
  description,
  onClose,
  closeDisabled,
  children,
  footer,
  className,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDisabled, onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-rise w-full max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_64px_rgba(16,32,51,0.14)]",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold tracking-tight text-ink"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 font-mono text-xs text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-40"
          >
            关闭
          </button>
        </div>
        {children}
        {footer ? <div className="mt-8 flex flex-wrap items-center gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}
