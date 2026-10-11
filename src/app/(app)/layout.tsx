import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { fmtDayTime, STATUS_LABEL } from "@/lib/format";
import { getViewer } from "@/server/club";

/** Служебная полоска тестового режима. TODO(auth): убрать, когда появится настоящий вход через Telegram. */
async function TestBanner() {
  const v = await getViewer();
  const who = v.member ? `${v.member.number != null ? `№${v.member.number} ` : ""}${v.member.name ?? "бывший участник"} · ${STATUS_LABEL[v.member.status]}` : `${v.displayName} · не в клубе`;
  return (
    <Link href="/dev" className="flex shrink-0 items-center justify-between gap-3 border-b border-warn/40 bg-warn/10 px-4 py-2 text-[11.5px] font-semibold text-warn">
      <span className="truncate">Тест · {who}</span>
      <span className="shrink-0">{fmtDayTime(v.now)} →</span>
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell banner={<TestBanner />}>{children}</AppShell>;
}
