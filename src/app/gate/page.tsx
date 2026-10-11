import { Plaque } from "@/components/club/Plaque";
import { GateForm } from "./GateForm";

/** Закрытая дверь: пароль на публичную ссылку. */
export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const configured = !!process.env.SITE_PASSWORD;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center bg-bg px-6 py-10">
      <Plaque />
      {configured ? (
        <>
          <h1 className="mt-10 text-[28px] font-extrabold leading-tight tracking-tight">Закрытый клуб</h1>
          <p className="mt-2 text-[15px] leading-snug text-mute">Это тестовая версия. Введи пароль, который тебе дали.</p>
          <GateForm next={sp.next ?? "/"} />
        </>
      ) : (
        <>
          <h1 className="mt-10 text-[28px] font-extrabold leading-tight tracking-tight">Нужен пароль</h1>
          <p className="mt-3 text-[15px] leading-snug text-mute">
            Приложение опубликовано, но пароль на него не задан, поэтому оно закрыто. В Vercel откройте Settings → Environment Variables, добавьте <b className="text-fg">SITE_PASSWORD</b> и сделайте Redeploy.
          </p>
        </>
      )}
    </div>
  );
}
