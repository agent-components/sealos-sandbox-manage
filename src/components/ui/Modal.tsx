"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
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
  /** 内容区最小高度，避免加载前后高度跳动 */
  bodyClassName?: string;
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
  bodyClassName,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [closeDisabled, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div className="animate-fade absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex max-h-[min(640px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-gray-300 bg-background shadow-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-300 px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-base font-semibold tracking-tight"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 truncate font-mono text-xs text-gray-600">
                {description}
              </p>
            ) : (
              <p className="mt-1 h-4" aria-hidden />
            )}
          </div>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            className="shrink-0 text-sm text-gray-500 transition hover:text-foreground disabled:opacity-40"
          >
            关闭
          </button>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 py-5",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-300 bg-gray-50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
