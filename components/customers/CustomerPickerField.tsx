// components/customers/CustomerPickerField.tsx — Searchable customer picker used in deal creation.
// Loads all customers for the user, filters client-side, and exposes an "Add new" option.

"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { getCustomersForUser } from "@/lib/firebase/customers";
import type { Customer } from "@/types";

interface CustomerPickerFieldProps {
  ownerId: string;
  value: { customerId: string; customerName: string } | null;
  onChange: (value: { customerId: string; customerName: string } | null) => void;
  onCreateNew: (initialName: string) => void;
}

export function CustomerPickerField({
  ownerId,
  value,
  onChange,
  onCreateNew,
}: CustomerPickerFieldProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCustomersForUser(ownerId).then(setCustomers);
  }, [ownerId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.practiceName.toLowerCase().includes(q)
    );
  });

  const showCreateOption = search.trim().length > 0;

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-zinc-50 px-3 py-2 text-sm">
        <span className="flex-1 truncate font-medium">{value.customerName}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setSearch("");
          }}
          className="text-muted-foreground hover:text-zinc-900"
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center rounded-md border bg-white px-3 focus-within:ring-1 focus-within:ring-ring">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search customers…"
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (filtered.length > 0 || showCreateOption) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md max-h-56 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ customerId: c.id, customerName: c.name });
                setOpen(false);
                setSearch("");
              }}
            >
              <span className="font-medium">{c.name}</span>
              {c.practiceName && (
                <span className="text-xs text-muted-foreground">{c.practiceName}</span>
              )}
            </button>
          ))}

          {showCreateOption && (
            <>
              {filtered.length > 0 && <div className="my-1 border-t" />}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onCreateNew(search.trim());
                  setSearch("");
                }}
              >
                <span className="text-lg leading-none">+</span>
                Create &ldquo;{search.trim()}&rdquo; as new customer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
