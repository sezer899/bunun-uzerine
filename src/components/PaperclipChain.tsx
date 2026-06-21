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
      ? { a: "#a07626", b: "#f4e0a3", c: "#b8852a" }
      : { a: "#9aa0a6", b: "#eef0f2", c: "#a3a8af" };

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

    // Halka boyutu: viewBox birimi. Dainty/narin paperclip estetiği.
    // Uzunluk korunur (~önceki); yükseklik %40 azaldı (sembol viewport'unda).
    const linkLen = 1.56; // major axis (önceki 2.6 → %40 küçültme)
    const step = linkLen * 0.68; // ~32% örtüşme: halkalar birbirine geçmiş hissi
    const n = Math.max(10, Math.min(80, Math.floor(total / step)));
    // Halkaları eğri boyunca ortala
    const used = (n - 1) * step;
    const startOffset = (total - used) / 2;

    const result: { x: number; y: number; angle: number }[] = [];
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
      result.push({ x: p.x, y: p.y, angle });
    }
    return { items: result, linkLen };
  }, [leftX, rightX, y, dip]);

  // Halka ölçeği (SVG viewBox 0..100). Sembol -10..10 x -1.8..1.8 (yükseklik
  // azaltılmış ince oval). Uzunluk: linkLen/20 ölçeği ile küçültülür.
  const linkScale = links.linkLen / 20;
  const stroke = baseWidth * 0.48; // %50+ inceltme

  // Çift-tek render sırası: önce çift indeksli halkalar, sonra tek indeksliler.
  // Tek halkalar üste binince zincirin halkaları birbirinin içinden geçiyor
  // hissi verir.
  const ordered = useMemo(() => {
    const evens = links.items.map((l, i) => ({ l, i })).filter(({ i }) => i % 2 === 0);
    const odds = links.items.map((l, i) => ({ l, i })).filter(({ i }) => i % 2 === 1);
    return [...evens, ...odds];
  }, [links]);

  return (
    <>
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor={stops.a} />
          <stop offset="50%" stopColor={stops.b} />
          <stop offset="100%" stopColor={stops.c} />
        </linearGradient>
        <symbol id={id} overflow="visible">
          {/* dış halka — yumuşak gölge */}
          <rect
            x={-10}
            y={-1.8}
            width={20}
            height={3.6}
            rx={1.8}
            ry={1.8}
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={(stroke / linkScale) + 0.15}
            vectorEffect="non-scaling-stroke"
            transform="translate(0,0.3)"
          />
          {/* ana halka */}
          <rect
            x={-10}
            y={-1.8}
            width={20}
            height={3.6}
            rx={1.8}
            ry={1.8}
            fill="none"
            stroke={`url(#${id}-grad)`}
            strokeWidth={(stroke / linkScale) + 0.02}
            vectorEffect="non-scaling-stroke"
          />
          {/* hafif iç highlight */}
          <rect
            x={-9.5}
            y={-1.4}
            width={19}
            height={2.8}
            rx={1.4}
            ry={1.4}
            fill="none"
            stroke={stops.b}
            strokeOpacity={0.35}
            strokeWidth={0.25}
            vectorEffect="non-scaling-stroke"
          />
        </symbol>
      </defs>
      {ordered.map(({ l, i }) => (
        <use
          key={i}
          href={`#${id}`}
          transform={`translate(${l.x} ${l.y}) rotate(${l.angle}) scale(${linkScale})`}
        />
      ))}
    </>
  );
}