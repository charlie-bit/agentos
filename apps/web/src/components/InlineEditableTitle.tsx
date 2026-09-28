import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Click-to-edit label. Enter/blur saves, Escape cancels. Caller owns
 * persistence (onSave) and what "no title" falls back to (placeholder) —
 * this component only owns the text-input lifecycle.
 */
export function InlineEditableTitle({
  value,
  placeholder,
  onSave,
  onCancel,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => void commit()}
        className="min-w-0 flex-1 rounded border border-primary/40 bg-background px-1 py-0.5 font-mono text-xs outline-none"
      />
      <button
        type="button"
        title="save"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void commit()}
        className="shrink-0 text-ok"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        title="cancel"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="shrink-0 text-muted-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
