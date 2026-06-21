import type { DesignState } from "@/lib/design-storage";

type PlacedLite = {
  itemId?: string;
  category?: string;
  t?: number;
  nx?: number;
  ny?: number;
  scale?: number;
};

function curvePoint(t: number, lx: number, rx: number, y: number, dip: number) {
  const cx = (lx + rx) / 2;
  const x = (1 - t) * (1 - t) * lx + 2 * (1 - t) * t * cx + t * t * rx;
  const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * dip + t * t * y;
  return { x, y: yy };
}

// Simple, deterministic color from itemId — so the same item shows the same
// color across thumbnails without needing the full item registry here.
function colorFor(id: string | undefined, fallback: string) {
  if (!id) return fallback;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

export function DesignThumbnail({
  design,
  preview,
  size = 72,
  className = "",
}: {
  design: DesignState | null | undefined;
  preview?: string | null;
  size?: number;
  className?: string;
}) {
  if (preview) {
    return (
      <img
        src={preview}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-md border border-stone-200 bg-white object-contain ${className}`}
      />
    );
  }
  const d = design ?? null;
  const placed = (d?.placed ?? []) as PlacedLite[];
  const chainColor = d?.chainColor === "gold" ? "#c9a24b" : "#9aa0a6";
  const lx = d?.chainLeftX ?? 9;
  const rx = d?.chainRightX ?? 91;
  const y = d?.chainY ?? 55;
  const dip = d?.chainDip ?? 90;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 rounded-md bg-stone-100 ${className}`}
      aria-hidden="true"
    >

      {/* zincir */}
      <path
        d={`M ${lx},${y} Q ${(lx + rx) / 2},${dip} ${rx},${y}`}
        fill="none"
        stroke={chainColor}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      {/* öğeler */}
      {placed.map((p, i) => {
        const isStone = p.category === "stone";
        let cx: number;
        let cy: number;
        if (typeof p.t === "number") {
          const pt = curvePoint(p.t, lx, rx, y, dip);
          cx = pt.x;
          cy = pt.y;
        } else {
          cx = (p.nx ?? 0.5) * 100;
          cy = (p.ny ?? 0.5) * 100;
        }
        const baseR = isStone ? 2.2 : 3.2;
        const r = baseR * (p.scale ?? 1);
        const fill = colorFor(p.itemId, isStone ? "#7c6cf2" : "#d6a36a");
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={Math.max(1, Math.min(r, 7))}
            fill={fill}
            stroke="white"
            strokeWidth={0.4}
          />
        );
      })}
    </svg>
  );
}
