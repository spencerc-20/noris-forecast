// components/rep/ConfirmDialog.tsx — Small dark-theme confirm prompt.
//
// Used by the row-delete action ("Remove [name] from your pipeline?") but
// generic enough to drop on any destructive action. Click backdrop or
// Cancel to dismiss; Confirm fires the supplied callback.

"use client";

import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" colours the confirm button red. Default is the accent (Noris red) too,
   *  so for V2 this is mostly cosmetic — both end up red. */
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  variant      = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape — quality-of-life for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmTone =
    variant === "danger"
      ? "bg-[color:var(--bad)] hover:bg-[color:var(--bad)]/90"
      : "bg-[color:var(--noris)] hover:bg-[color:var(--noris)]/90";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[color:var(--border-spec)] bg-[color:var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[color:var(--border-spec)]">
          <h2 className="text-[13px] font-semibold text-[color:var(--text-spec)]">{title}</h2>
          {body && (
            <p className="text-[12px] text-[color:var(--muted-spec)] mt-1.5 leading-relaxed">{body}</p>
          )}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-[color:var(--border-spec)] text-[color:var(--muted-spec)] hover:text-[color:var(--text-spec)] hover:border-[color:var(--muted-spec)] px-3 py-1.5 text-[12px] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded-md text-white px-3 py-1.5 text-[12px] font-medium transition-colors ${confirmTone}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
