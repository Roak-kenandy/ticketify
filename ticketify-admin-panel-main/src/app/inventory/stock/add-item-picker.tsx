"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type PickerOption = {
  id: string;
  label: string;
  code?: string;
  group?: string;
  /** Short note on the right, e.g. "Holds 4 Units". */
  hint?: string;
  serialized?: boolean;
};

/** Every search word must appear in the name, code or group. */
function matches(_value: string, search: string, keywords?: string[]) {
  const haystack = (keywords ?? []).join(" ").toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
    ? 1
    : 0;
}

/**
 * Searchable list rendered inside the dialog (not in a floating layer), so it
 * scrolls with a trackpad or mouse wheel and never covers the form.
 */
export function AddItemPicker({
  open,
  onOpenChange,
  options,
  onPick,
  label,
  placeholder = "Search by name, code or category…",
  emptyText = "No matching items.",
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PickerOption[];
  onPick: (id: string) => void;
  label: string;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, PickerOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [options]);
  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-start gap-2 border-dashed text-muted-foreground hover:text-foreground"
        onClick={() => onOpenChange(true)}
        disabled={disabled || !options.length}
      >
        <Plus className="h-4 w-4" />
        {options.length ? label : `${label} (nothing left to add)`}
      </Button>
    );
  }

  return (
    <div ref={panel} className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Command filter={matches} loop>
        <div className="flex items-center border-b">
          <div className="min-w-0 flex-1 [&_[cmdk-input-wrapper]]:border-0">
            <CommandInput placeholder={placeholder} autoFocus aria-label={label} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-1 h-8 w-8 shrink-0"
            aria-label="Close item search"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CommandList className="max-h-[min(18rem,45dvh)] overscroll-contain">
          <CommandEmpty>{emptyText}</CommandEmpty>
          {groups.map(([group, list]) => (
            <CommandGroup key={group || "items"} heading={group || undefined}>
              {list.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  keywords={[option.label, option.code ?? "", option.group ?? ""]}
                  onSelect={() => {
                    onPick(option.id);
                    onOpenChange(false);
                  }}
                  className="cursor-pointer gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{option.label}</div>
                    {option.code && <div className="font-mono text-[11px] text-muted-foreground">{option.code}</div>}
                  </div>
                  {option.hint && <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
                  {option.serialized && (
                    <Badge variant="info" className="shrink-0">
                      Serial
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
      <p className="border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        ↑ ↓ to move · Enter to add · Esc to close
      </p>
    </div>
  );
}
