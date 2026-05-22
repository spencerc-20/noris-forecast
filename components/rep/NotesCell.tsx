// components/rep/NotesCell.tsx — Inline-edit notes textarea (customer-level, persists across months).
//
// Lives under the main row in a thin sub-row so the dense 7-col grid above
// stays intact. Single-line height + truncate when collapsed; auto-grows to
// up to 4 visible rows when focused. Transparent border until hover/focus —
// matches the V2 inline-edit pattern (accent border on focus, surface-2 bg).

"use client";

import { useEffect, useRef, useState } from "react";

interface NotesCellProps {
  /** Current persisted notes value (from the customer record). */
  value: string;
  /** Called on every keystroke — page-level autosave coalesces by customer. */
  onChange: (next: string) => void;
}

// Visible label / placeholder is "Strategy for this doctor". The underlying
// field is still stored as `customer.notes` — only the surface copy changed.
const PLACEHOLDER = "+ strategy for this doctor…";
const MAX_ROWS    = 4;
const MIN_ROWS    = 1;

export function NotesCell({ value, onChange }: NotesCellProps) {
  const [draft, setDraft]   = useState<string>(value ?? "");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-sync if the underlying value changes from a different tab / device.
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  // Auto-grow the textarea (up to MAX_ROWS) when focused.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!focused) {
      ta.style.height = "auto";
      return;
    }
    ta.style.height = "auto";
    const lineHeight = 18; // matches text-[12px] leading-snug
    const rows = Math.min(
      MAX_ROWS,
      Math.max(MIN_ROWS, Math.ceil(ta.scrollHeight / lineHeight))
    );
    ta.style.height = `${rows * lineHeight + 6}px`; // +6px padding fudge
  }, [draft, focused]);

  return (
    <div className="pl-4 pr-4 pb-2 -mt-1">
      <textarea
        ref={textareaRef}
        value={draft}
        placeholder={PLACEHOLDER}
        rows={1}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`
          block w-full resize-none
          text-[12px] leading-snug tabular-nums
          border rounded-md
          transition-colors
          focus:outline-none
          ${
            focused
              ? "bg-[color:var(--surface-2)] border-[color:var(--noris)] text-[color:var(--text-spec)] px-2 py-1"
              : draft
              ? "bg-transparent border-transparent text-[color:var(--muted-spec)] hover:border-[color:var(--border-spec)] px-2 py-0.5"
              : "bg-transparent border-transparent text-[color:var(--muted-spec)]/60 italic hover:border-[color:var(--border-spec)] hover:not-italic px-2 py-0.5"
          }
        `}
        // When collapsed, force single-line + ellipsis-ish look by hiding overflow.
        style={focused ? undefined : { height: "22px", overflow: "hidden", whiteSpace: "nowrap" }}
      />
    </div>
  );
}
