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
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-rise w-full max-w-lg rounded-lg border border-gray-300 bg-background shadow-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-300 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 font-mono text-xs text-gray-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            className="text-sm text-gray-500 transition hover:text-foreground disabled:opacity-40"
          >
            关闭
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-300 bg-gray-50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
