/** Печатает числа симуляции Пульса для отчёта: npm run sim */
import { PULSE_V1 } from "../src/config";
import { runSimulation, median } from "../src/simulation";

const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
const f = (x: number) => x.toFixed(1);

function table(title: string, opts: Parameters<typeof runSimulation>[0] extends infer O ? Partial<O> : never) {
  const rs = seeds.map((seed) => runSimulation({ seed, ...opts }));
  const avg = (pick: (r: (typeof rs)[number]) => number) => rs.reduce((s, r) => s + pick(r), 0) / rs.length;
  const one = rs[0].stats;
  const passed = rs.filter((r) => r.stats.ringMedian < r.stats.honestQ1).length;
  console.log(`\n${title}`);
  console.log(`  seed 1:      медиана честных ${f(one.honestMedian)} · нижняя четверть ${f(one.honestQ1)} · кольцо ${f(one.ringMedian)}`);
  console.log(`  25 seed ср.: медиана честных ${f(avg((r) => r.stats.honestMedian))} · нижняя четверть ${f(avg((r) => r.stats.honestQ1))} · кольцо ${f(avg((r) => r.stats.ringMedian))}`);
  console.log(`  условие «кольцо < нижней четверти честных»: ${passed}/${seeds.length} seed`);
}

console.log("Ориентир из контекста: медиана честных 56 · нижняя четверть 42 · кольцо 24");
table("Базовая модель (честный встречается с 1 новым человеком в месяц; кольцо — только внутри себя)", {});
table("Чувствительность: честные встречаются реже (0,5 в месяц)", { honestMeetingsPerMonth: 0.5 });
table("Атака усилена: кольцо ещё и встречается с честными раз в месяц", { ringMeetsHonest: true });
table("Режим потолка пары proportional", { params: { ...PULSE_V1, pair_cap_mode: "proportional" } });
console.log("\nМедиана неактивных:", median(runSimulation({ seed: 1 }).inactive));
