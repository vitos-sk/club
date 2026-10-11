import { allCsv } from "@core/export";
import { getViewer } from "@/server/club";

const NAMES: Record<string, string> = { participants: "participants.csv", helps: "helps.csv", meetings: "meetings.csv", credits: "credits.csv" };

/** Выгрузка «листов» таблицы. Только создатель и Совет: в файлах есть личные данные. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const v = await getViewer();
  if (!v.staff) return new Response("Нет доступа", { status: 403 });
  const { name } = await params;
  const file = NAMES[name];
  if (!file) return new Response("Нет такого листа", { status: 404 });
  const csv = (await allCsv(v.store)).find((f) => f.filename === file)!;
  // BOM — чтобы Excel правильно открыл кириллицу
  return new Response("﻿" + csv.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
