import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function RoomCard({
  href,
  icon,
  title,
  live,
  alert,
  locked,
}: {
  href: string;
  icon: IconName;
  title: string;
  live: string;
  alert?: boolean;
  locked?: boolean;
}) {
  return (
    <Link href={href} className="relative flex flex-col rounded-2xl border border-line bg-card p-4 pb-4 active:bg-hover">
      {alert && <span className="absolute right-3.5 top-3.5 size-2.5 rounded-full bg-warn shadow-[0_0_8px_var(--color-warn)]" />}
      <Icon name={icon} className="mb-5 size-7 text-accent" />
      <b className="text-[17px] font-bold leading-tight">{title}</b>
      <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-mute">
        <i className={cn("size-1.5 rounded-full", locked ? "bg-mute/60" : "bg-accent shadow-[0_0_8px_var(--color-accent)]")} />
        {live}
      </span>
    </Link>
  );
}
