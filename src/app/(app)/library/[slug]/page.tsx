import { notFound } from "next/navigation";
import { BackLink } from "@/components/shell/BackLink";
import { Button } from "@/components/ui/Button";
import { articles, person } from "@/lib/mock";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

/** Статья библиотеки */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articles.find((x) => x.slug === slug);
  if (!a) notFound();
  return (
    <>
      <BackLink href="/library">Библиотека</BackLink>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-2">{a.tag}</div>
      <h1 className="text-[29px] font-extrabold leading-[1.15] tracking-tight">{a.title}</h1>
      <div className="mb-6 mt-3 text-[13px] text-mute">
        {a.min} мин · от участника {person(a.by)}
      </div>
      <div className="space-y-4 text-[16.5px] leading-relaxed">
        {a.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className="mt-6 text-[13px] text-mute">Пример наполнения. Настоящие тексты приходят от участников.</p>
      <div className="mt-7">
        <Button href="/library" variant="outline">
          К списку
        </Button>
      </div>
    </>
  );
}
