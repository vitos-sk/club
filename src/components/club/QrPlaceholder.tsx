/** Заглушка QR-кода. Настоящий код (живой, подписанный сервером) сделаем позже. */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function QrPlaceholder({ size = 188, seed = 7001 }: { size?: number; seed?: number }) {
  const N = 25;
  const r = rng(seed);
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#151515" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#151515" />
    </g>
  );
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      if (!inFinder && r() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#151515" />);
    }
  }
  return (
    <div className="mx-auto w-max rounded-2xl bg-white p-4">
      <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="QR-код">
        {cells}
        {finder(0, 0)}
        {finder(N - 7, 0)}
        {finder(0, N - 7)}
      </svg>
    </div>
  );
}
