import { Boxes, BookOpen, MessagesSquare } from "lucide-react";
import { EMPTY_COPY, type EmptyVariant } from "../lib/empty-state";

const ICON = { "no-provider": Boxes, "no-sessions": MessagesSquare, "no-kb": BookOpen } as const;

/** First-run guidance (spec #268): an empty console explains itself. */
export function EmptyState({ variant }: { variant: EmptyVariant }) {
  const copy = EMPTY_COPY[variant];
  const Icon = ICON[variant];
  return (
    <div className="mt-[22vh] flex max-w-md flex-col items-center gap-2 self-center text-center text-sm text-muted-foreground">
      <Icon className="h-6 w-6 opacity-40" />
      <span className="font-semibold text-foreground">{copy.title}</span>
      <span>{copy.body}</span>
      <span className="text-[11px] uppercase tracking-wide">{copy.action}</span>
    </div>
  );
}
