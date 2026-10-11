import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <div className="text-[64px] font-extrabold leading-none">404</div>
      <p className="text-mute">Такой комнаты в клубе нет.</p>
      <Link href="/" className="rounded-xl bg-accent px-6 py-3.5 font-bold text-ink">
        В холл
      </Link>
    </div>
  );
}
