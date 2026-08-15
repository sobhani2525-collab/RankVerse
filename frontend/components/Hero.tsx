export default function Hero() {
  // Fixed abstract node positions for the ambient backdrop — not tied to real data,
  // purely atmospheric, kept subtle so it doesn't compete with the real constellations below.
  const nodes = [
    [8, 20], [18, 55], [30, 15], [42, 60], [55, 25],
    [65, 50], [78, 18], [88, 45], [95, 65], [50, 80],
  ];
  const edges = [[0, 2], [2, 4], [4, 6], [6, 7], [1, 3], [3, 5], [5, 8], [4, 9], [1, 0]];

  return (
    <section className="relative overflow-hidden border-b border-border bg-sky-gradient px-6 py-20 sm:py-28">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a][0]}
            y1={nodes[a][1]}
            x2={nodes[b][0]}
            y2={nodes[b][1]}
            className="edge-line"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.5} fill="#E8B34A" opacity={0.7} />
        ))}
      </svg>

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="num text-xs uppercase tracking-widest text-teal">RankVerse Core Engine</p>
        <h1 className="mt-4 text-4xl font-black leading-tight text-ink sm:text-5xl">
          نقشه‌ای از برترین‌های سینما،
          <br />
          ساخته‌شده از رای شما و تحلیل هوش مصنوعی
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
          هر فیلم یک گره است، هر رای یک روشنایی. رتبه‌بندی زیر، ترکیب زنده‌ای‌ست از امتیاز
          هزاران کاربر و تحلیل داده‌ی فیلم‌ها روی گراف دانش RankVerse.
        </p>
      </div>
    </section>
  );
}
