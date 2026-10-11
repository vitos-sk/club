import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { person, type Note } from "@/lib/mock";

/** Записка на доске запросов */
export function NoteCard({
  note,
  action = "Могу помочь",
  href,
  mine,
}: {
  note: Pick<Note, "sphere" | "title" | "urgent"> & { by?: number; due?: string; replies?: number };
  action?: string;
  href?: string;
  mine?: boolean;
}) {
  const meta = [
    note.by ? person(note.by) : null,
    note.due ?? null,
    note.replies != null ? `откликов ${note.replies}` : null,
  ].filter(Boolean);
  return (
    <div className={cn("mb-3.5 rounded-2xl border bg-card p-5", mine ? "border-accent/70" : "border-line")}>
      <div className="mb-2 flex gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
        <span>{mine ? "Мой запрос" : note.sphere}</span>
        {note.urgent && <span className="text-warn">· срочно</span>}
      </div>
      <h3 className="text-[17px] font-bold leading-snug">{note.title}</h3>
      {meta.length > 0 && <div className="mb-4 mt-2 text-[13px] text-mute">{meta.join(" · ")}</div>}
      <Button href={href} variant={mine ? "primary" : "outline"} size="sm" className="mt-1">
        {action}
      </Button>
    </div>
  );
}
