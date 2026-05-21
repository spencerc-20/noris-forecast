// lib/hooks/useAutosave.ts — Debounced autosave for inline-edit cells.
//
// REVAMP v2.0: every inline cell change calls `request(value)` and the hook
// flushes to Firebase ~800 ms after the last keystroke. The page-level save
// status badge reads `status` to render "Saving…" / "Saved ✓" / "Error".
//
// The hook is generic so the same instance can save number / string / DocType
// fields. The save function takes the latest queued value as input — it's the
// caller's responsibility to translate that into a Firebase write.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEFAULT_DEBOUNCE_MS = 800;
/** How long "Saved ✓" stays on screen before fading back to idle. */
const SAVED_LINGER_MS = 1500;

export interface UseAutosaveResult<T> {
  /** Call on every change — schedules a save (or coalesces with one already queued). */
  request: (value: T) => void;
  /** Flush a queued save immediately (e.g. on input blur). No-op when idle. */
  flushNow: () => void;
  /** Drop a queued save without writing (e.g. when component unmounts). */
  cancel: () => void;
  status: SaveStatus;
  /** Last write error message, if status === "error". */
  errorMessage: string | null;
}

/**
 * Generic debounced autosave.
 * @param saveFn  Function that performs the write. Receives the most recent value.
 * @param debounceMs  Wait this long after the last `request()` before saving. Default 800 ms.
 */
export function useAutosave<T>(
  saveFn: (value: T) => Promise<void>,
  debounceMs: number = DEFAULT_DEBOUNCE_MS
): UseAutosaveResult<T> {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs so the timer callback always sees the latest values without re-binding.
  const queuedValueRef  = useRef<{ value: T } | null>(null);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef       = useRef(saveFn);
  saveFnRef.current = saveFn;

  const performSave = useCallback(async () => {
    const queued = queuedValueRef.current;
    if (!queued) return;
    queuedValueRef.current = null;
    setStatus("saving");
    setErrorMessage(null);
    try {
      await saveFnRef.current(queued.value);
      setStatus("saved");
      // Linger on "Saved ✓" briefly, then quietly return to idle.
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = setTimeout(() => setStatus("idle"), SAVED_LINGER_MS);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const request = useCallback(
    (value: T) => {
      queuedValueRef.current = { value };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(performSave, debounceMs);
    },
    [performSave, debounceMs]
  );

  const flushNow = useCallback(() => {
    if (!queuedValueRef.current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void performSave();
  }, [performSave]);

  const cancel = useCallback(() => {
    queuedValueRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cancel any pending timer on unmount so we don't write into a dead component.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    };
  }, []);

  return { request, flushNow, cancel, status, errorMessage };
}
