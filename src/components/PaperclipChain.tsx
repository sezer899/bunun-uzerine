import { useMemo } from "react";

type Props = {
  leftX: number;
  rightX: number;
  y: number;
  dip: number;
  color: "silver" | "gold";
  /** Stroke kalınlığı (SVG viewBox birimi, 0..100). */
  baseWidth?: number;
};

function curvePoint(t: number, lx: number, rx: number, y: number, dip: number) {
  const cx = (lx + rx) / 2;
  const x = (1 - t) * (1 - t) * lx + 2 * (1 - t) * t * cx + t * t * rx;
  const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * dip + t * t * y;
  return { x, y: yy };
}

function curveTangent(t: number, lx: number, rx: number, y: number, dip: number) {
  const cx = (lx + rx) / 2;
  const dx = 2 * (1 - t) * (cx - lx) + 2 * t * (rx - cx);
  const dy = 2 * (1 - t) * (dip - y) + 2 * t * (y - dip);
  return { dx, dy };
}

/**
 * Paperclip (ataç) zincir — quadratic Bézier eğri boyunca eşit arc-length
 * aralıklarla oval halkalar yerleştirir. Halkalar teğete hizalı, komşu
 * halkalar 90° döndürülerek gerçek bir takı zinciri etkisi verir.
 * Charm konumlandırma matematiği değişmez — bu yalnızca görsel katman.
 */
export function PaperclipChain({
  leftX,
  rightX,
  y,
  dip,
  color,
  baseWidth = 0.45,
}: Props) {
  const id = color === "gold" ? "paperclip-gold" : "paperclip-silver";
  const stops =
    color === "gold"
      ? { a: "#8a5f12", b: "#fff0bf", c: "#a87a1f" }
      : { a: "#7c8189", b: "#f3f4f6", c: "#9ca3af" };

  const links = useMemo(() => {
    // Arc-length yaklaşımı: 40 örnek topla, eşit aralıklarla dağıt.
    const SAMPLES = 40;
    const pts: { x: number; y: number; t: number }[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = curvePoint(t, leftX, rightX, y, dip);
      pts.push({ x: p.x, y: p.y, t });
    }
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    const total = cum[cum.length - 1] || 1;

    // Halka boyutu: viewBox birimi. Mobil performans için üst sınır.
    const linkLen = 2.6; // major axis
    const step = linkLen * 0.72; // halkalar uçlarından birbirine geçer
    const n = Math.max(6, Math.min(48, Math.floor(total / step)));
    // Halkaları eğri boyunca ortala
    const used = (n - 1) * step;
    const startOffset = (total - used) / 2;

    const result: { x: number; y: number; angle: number; alt: boolean }[] = [];
    let j = 1;
    for (let i = 0; i < n; i++) {
      const target = startOffset + i * step;
      while (j < cum.length && cum[j] < target) j++;
      const j0 = Math.max(1, j);
      const segLen = cum[j0] - cum[j0 - 1] || 1;
      const frac = (target - cum[j0 - 1]) / segLen;
      const t = pts[j0 - 1].t + (pts[j0].t - pts[j0 - 1].t) * frac;
      const p = curvePoint(t, leftX, rightX, y, dip);
      const tan = curveTangent(t, leftX, rightX, y, dip);
      const angle = (Math.atan2(tan.dy, tan.dx) * 180) / Math.PI;
      result.push({ x: p.x, y: p.y, angle, alt: i % 2 === 1 });
    }
    return { items: result, linkLen };
  }, [leftX, rightX, y, dip]);

  // Halka ölçeği (SVG viewBox 0..100). Halkayı çizimde sembol içinde
  // -10..10 x -3..3 olarak tanımlıyoruz; scale ile linkLen/20'ye küçültüyoruz.
  const linkScale = links.linkLen / 20;
  const stroke = baseWidth * 0.95;

  return (
    <>
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stops.b} />
          <stop offset="50%" stopColor={stops.c} />
          <stop offset="100%" stopColor={stops.a} />
        </linearGradient>
        <symbol id={id} overflow="visible">
          {/* dış halka — gölge */}
          <rect
            x={-10}
            y={-3}
            width={20}
            height={6}
            rx={3}
            ry={3}
            fill="none"
            stroke="rgba(0,0,0,0.28)"
            strokeWidth={stroke / linkScale + 0.35}
            vectorEffect="non-scaling-stroke"
            transform="translate(0,0.7)"
          />
          {/* ana halka */}
          <rect
            x={-10}
            y={-3}
            width={20}
            height={6}
            rx={3}
            ry={3}
            fill="none"
            stroke={`url(#${id}-grad)`}
            strokeWidth={stroke / linkScale + 0.05}
            vectorEffect="non-scaling-stroke"
          />
          {/* iç highlight */}
          <rect
            x={-9.4}
            y={-2.4}
            width={18.8}
            height={4.8}
            rx={2.4}
            ry={2.4}
            fill="none"
            stroke={stops.b}
            strokeOpacity={0.55}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        </symbol>
      </defs>
      {links.items.map((l, i) => (
        <use
          key={i}
          href={`#${id}`}
          transform={`translate(${l.x} ${l.y}) rotate(${l.angle}) scale(${linkScale} ${linkScale * (l.alt ? 0.55 : 1)})`}
        />
      ))}
    </>
  );
}