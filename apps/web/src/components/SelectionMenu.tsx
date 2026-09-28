import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";

/**
 * One listener for the whole chat pane (not per-message): cheaper, and a
 * selection spanning two messages still works. Selecting inside the
 * composer or sidebar is a no-op because the range's ancestor isn't under
 * this container.
 */
export function SelectionMenu({ children, onQuote }: { children: React.ReactNode; onQuote: (text: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ top: number; left: number; text: string } | null>(null);

  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const container = containerRef.current;
      if (!sel || sel.rangeCount === 0 || text.length === 0 || !container) {
        setMenu(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setMenu(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setMenu(null);
        return;
      }
      setMenu({ top: rect.top - 32, left: rect.left + rect.width / 2, text });
    };
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {children}
      {menu && (
        <button
          type="button"
          style={{ position: "fixed", top: Math.max(4, menu.top), left: menu.left, transform: "translateX(-50%)" }}
          className="z-50 flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[11px] shadow-lg hover:bg-primary/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onQuote(menu.text);
            window.getSelection()?.removeAllRanges();
            setMenu(null);
          }}
        >
          <MessageSquarePlus className="h-3 w-3" /> quote &amp; ask
        </button>
      )}
    </div>
  );
}
