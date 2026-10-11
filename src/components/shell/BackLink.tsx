import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function BackLink({ href = "/", children = "Холл" }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="mb-5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-accent-2">
      <Icon name="back" className="size-[18px]" />
      {children}
    </Link>
  );
}
