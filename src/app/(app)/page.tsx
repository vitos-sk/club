import { KeyCard } from "@/components/club/KeyCard";
import { Plaque } from "@/components/club/Plaque";
import { RoomCard } from "@/components/club/RoomCard";
import { TaskRow } from "@/components/club/TaskRow";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { rooms, tasks } from "@/lib/mock";

/** Холл — главный экран */
export default function HallPage() {
  const done = tasks.filter((t) => t.done).length;
  return (
    <>
      <Plaque />
      <div className="mt-7">
        <KeyCard />
      </div>

      <SectionTitle aside={`${done} из ${tasks.length}`}>У стойки</SectionTitle>
      <div>
        {tasks.map((t) => (
          <TaskRow key={t.id} title={t.title} sub={t.sub} href={t.href} cta={t.cta} done={t.done} />
        ))}
      </div>

      <SectionTitle>Комнаты клуба</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {rooms.map((r) => (
          <RoomCard key={r.href} {...r} />
        ))}
      </div>
    </>
  );
}
