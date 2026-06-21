import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import neckImg from "@/assets/neck.jpg";
import {
  getStones,
  getCharms,
  getParts,
  type StoneDTO,
  type CharmDTO,
  type PartDTO,
} from "@/lib/wix.functions";
import { SavedDesignsDialog } from "@/components/SavedDesignsDialog";
import { PaperclipChain } from "@/components/PaperclipChain";
import { loadDraft, saveDraft, clearDraft, type DesignState } from "@/lib/design-storage";
import { useIsMobile } from "@/hooks/use-mobile";

const stonesQueryOptions = queryOptions({
  queryKey: ["stones"],
  queryFn: () => getStones(),
  staleTime: 60_000,
});
const charmsQueryOptions = queryOptions({
  queryKey: ["charms"],
  queryFn: () => getCharms(),
  staleTime: 60_000,
});
const partsQueryOptions = queryOptions({
  queryKey: ["parts"],
  queryFn: () => getParts(),
  staleTime: 60_000,
});

/* ------------------------------ Constants ------------------------------ */

const BASE_WIDTH = 1000;
const BASE_STONE_SIZE = 44;
const BASE_CHARM_SIZE = 120;
const CHARM_REFERENCE_MM = 30; // 30mm = BASE_CHARM_SIZE; charms scale linearly with their `boyut` in mm.
const PART_SCALE = 0.30; // takı parçaları (uzatmalar) sabit %30
const BASE_ROPE_WIDTH = 0.45; // in SVG viewBox units (0..100)
const STONE_TOUCH_FACTOR = 0.72;
const STONE_SIZE_SCALE: Record<number, number> = { 3: 3 / 9, 6: 6 / 9, 9: 1 };

/* ------------------------------ Renderers ------------------------------ */

// Sabit ışık kaynağı (tuvalin sol-üstünde) — taşın canvas'taki normalize
// konumuna göre highlight ve gölge yönünü/şiddetini hesaplarız.
const LIGHT_POS = { x: 0.18, y: 0.12 };

const StoneVisual = ({
  src,
  size,
  px = 0.5,
  py = 0.5,
  intensity: globalIntensity = 1,
}: {
  src: string;
  size: number;
  px?: number;
  py?: number;
  intensity?: number;
}) => {
  // Vektör: ışıktan taşa
  const dx = px - LIGHT_POS.x;
  const dy = py - LIGHT_POS.y;
  const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 1.1);
  const intensity = 1 - dist; // 0 (uzak) .. 1 (ışığa yakın)
  const k = Math.max(0, Math.min(1, globalIntensity));

  // Highlight: ışık yönünün TERSİNDE (taşın ışığa bakan yüzünde) konumlanır.
  // dx,dy taştan dışarıya değil, ışıktan taşa baktığı için, highlight'ı
  // ışığa doğru kaydırmak = -normalize(dx,dy)
  const norm = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
  const ux = -dx / norm;
  const uy = -dy / norm;
  // Taşın yarıçapına göre highlight ofseti (% cinsinden)
  const hlX = 50 + ux * 28;
  const hlY = 50 + uy * 28;
  // Gölgenin (terminator) merkezi: ışığın tam tersi tarafta
  const shX = 50 - ux * 35;
  const shY = 50 - uy * 35;

  const hlAlpha = (0.35 + intensity * 0.45) * k;
  const shAlpha = (0.30 + (1 - intensity) * 0.30) * k;
  const dropX = -ux * Math.max(1, size * 0.06);
  const dropY = -uy * Math.max(1, size * 0.06) + size * 0.04;
  const dropBlur = Math.max(2, size * 0.18);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        filter: `drop-shadow(${dropX}px ${dropY}px ${dropBlur}px rgba(0,0,0,${(0.18 + (1 - intensity) * 0.18) * k}))`,
      }}
    >
      <img
        src={src}
        width={size}
        height={size}
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          userSelect: "none",
          display: "block",
        }}
        alt=""
      />
      {/* Gövde gölgesi (terminator) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          pointerEvents: "none",
          background: `radial-gradient(circle at ${shX}% ${shY}%, rgba(0,0,0,${shAlpha}) 0%, rgba(0,0,0,${shAlpha * 0.55}) 28%, rgba(0,0,0,0) 62%)`,
          mixBlendMode: "multiply",
        }}
      />
      {/* Specular highlight */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          pointerEvents: "none",
          background: `radial-gradient(circle at ${hlX}% ${hlY}%, rgba(255,255,255,${hlAlpha}) 0%, rgba(255,255,255,${hlAlpha * 0.5}) 8%, rgba(255,255,255,0) 26%)`,
          mixBlendMode: "screen",
        }}
      />
      {/* Küçük, keskin parlama noktası */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${hlX}%`,
          top: `${hlY}%`,
          width: Math.max(2, size * 0.12),
          height: Math.max(2, size * 0.12),
          marginLeft: -Math.max(2, size * 0.12) / 2,
          marginTop: -Math.max(2, size * 0.12) / 2,
          borderRadius: "50%",
          pointerEvents: "none",
          background: `radial-gradient(circle, rgba(255,255,255,${(0.55 + intensity * 0.35) * k}) 0%, rgba(255,255,255,0) 70%)`,
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
};

const StoneImage = (src: string, lightIntensity: number) => (size: number, px?: number, py?: number) => (
  <StoneVisual src={src} size={size} px={px} py={py} intensity={lightIntensity} />
);

const CharmImage = (src: string) => (size: number) => (
  <img
    src={src}
    width={size}
    height={size}
    draggable={false}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,.15))",
      userSelect: "none",
    }}
    alt=""
  />
);


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kolye Tasarımcı" },
      { name: "description", content: "Taş ve charm sürükleyerek kendi kolyenizi tasarlayın." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(stonesQueryOptions),
      context.queryClient.ensureQueryData(charmsQueryOptions),
      context.queryClient.ensureQueryData(partsQueryOptions),
    ]),
  errorComponent: ({ error, reset }) => (
    <div className="p-8 text-center text-stone-700">
      <p className="mb-3">İçerikler yüklenemedi: {error.message}</p>
      <button
        onClick={reset}
        className="rounded-md border border-stone-400 bg-white px-4 py-2 text-sm hover:bg-stone-100"
      >
        Tekrar dene
      </button>
    </div>
  ),
  pendingComponent: () => (
    <div className="p-8 text-center text-stone-500">İçerikler yükleniyor…</div>
  ),
  component: Designer,
});

type Category = "stone" | "charm" | "part";
type Item = {
  id: string;
  name: string;
  price: number;
  category: Category;
  render: (size: number, px?: number, py?: number) => ReactElement;
  sizes?: number[];
  sizeMm?: number;
};





/**
 * Placed item — all positions are normalised (0..1) so they scale with any
 * container size. Items "on" the chain store `t` (position along the curve);
 * free items store `nx`/`ny` (normalised x/y inside the preview).
 */
type Placed = {
  uid: string;
  itemId: string;
  category: Category;
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

/* ------------------------------ Component ------------------------------ */

function Designer() {
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [history, setHistory] = useState<Placed[][]>([]);
  const snapshot = () =>
    setHistory((h) => [...h, placed].slice(-50));
  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setPlaced(h[h.length - 1]);
      setSelectedUid(null);
      return h.slice(0, -1);
    });
  };
  const clearAll = () => {
    if (placed.length === 0) return;
    snapshot();
    setPlaced([]);
    setSelectedUid(null);
  };
  const [draggingNew, setDraggingNew] = useState<Item | null>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [charmDrag, setCharmDrag] = useState<
    | { uid: string; nx: number; ny: number; offX: number; offY: number }
    | null
  >(null);
  // Mirror of charmDrag for synchronous reads in pointermove/up handlers
  // (React state updates lag behind rapid pointer events).
  const charmDragRef = useRef<
    | { uid: string; nx: number; ny: number; offX: number; offY: number }
    | null
  >(null);
  const lastTapRef = useRef<{ uid: string; time: number } | null>(null);
  const tryDoubleTap = (uid: string): boolean => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.uid === uid && now - last.time < 400) {
      lastTapRef.current = null;
      removePlaced(uid);
      return true;
    }
    lastTapRef.current = { uid, time: now };
    return false;
  };
  const [chainDip, setChainDip] = useState(88);
  const [chainLeftX, setChainLeftX] = useState(9);
  const [chainRightX, setChainRightX] = useState(91);
  const [chainY, setChainY] = useState(52);
  const [chainColor, setChainColor] = useState<"silver" | "gold">("silver");
  const [chainStyle, setChainStyle] = useState<"rope" | "paperclip">("rope");
  const [trayOpen, setTrayOpen] = useState<null | "stones" | "charms" | "parts">(null);
  const [zoom, setZoom] = useState(1);
  const isMobile = useIsMobile();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightEnabled, setLightEnabled] = useState(true);
  const [lightIntensity, setLightIntensity] = useState(0.65);
  const draftHydratedRef = useRef(false);

  // İlk mount'ta yerel taslağı sessizce geri yükle (varsa).
  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    const d = loadDraft();
    if (!d) return;
    if (Array.isArray(d.placed)) setPlaced(d.placed as Placed[]);
    if (typeof d.chainDip === "number") setChainDip(d.chainDip);
    if (typeof d.chainLeftX === "number") setChainLeftX(d.chainLeftX);
    if (typeof d.chainRightX === "number") setChainRightX(d.chainRightX);
    if (typeof d.chainY === "number") setChainY(d.chainY);
    if (d.chainColor === "gold" || d.chainColor === "silver") setChainColor(d.chainColor);
    if (d.chainStyle === "rope" || d.chainStyle === "paperclip") setChainStyle(d.chainStyle);
    if (typeof d.lightEnabled === "boolean") setLightEnabled(d.lightEnabled);
    if (typeof d.lightIntensity === "number") setLightIntensity(d.lightIntensity);
  }, []);

  // Tasarım değiştikçe taslağı debounce ile yerelde saklar.
  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const t = setTimeout(() => {
      saveDraft({ placed, chainDip, chainLeftX, chainRightX, chainY, chainColor, chainStyle, lightEnabled, lightIntensity });
    }, 400);
    return () => clearTimeout(t);
  }, [placed, chainDip, chainLeftX, chainRightX, chainY, chainColor, chainStyle, lightEnabled, lightIntensity]);

  const currentDesign: DesignState = {
    placed,
    chainDip,
    chainLeftX,
    chainRightX,
    chainY,
    chainColor,
    chainStyle,
    lightEnabled,
    lightIntensity,
  };
  const loadFromGallery = (d: DesignState) => {
    snapshot();
    if (Array.isArray(d.placed)) setPlaced(d.placed as Placed[]);
    if (typeof d.chainDip === "number") setChainDip(d.chainDip);
    if (typeof d.chainLeftX === "number") setChainLeftX(d.chainLeftX);
    if (typeof d.chainRightX === "number") setChainRightX(d.chainRightX);
    if (typeof d.chainY === "number") setChainY(d.chainY);
    if (d.chainColor === "gold" || d.chainColor === "silver") setChainColor(d.chainColor);
    if (d.chainStyle === "rope" || d.chainStyle === "paperclip") setChainStyle(d.chainStyle);
    else setChainStyle("rope");
    if (typeof d.lightEnabled === "boolean") setLightEnabled(d.lightEnabled);
    if (typeof d.lightIntensity === "number") setLightIntensity(d.lightIntensity);
    setSelectedUid(null);
    setSelectedGroup(new Set());
  };
  const [infoBubble, setInfoBubble] = useState<{
    text: string;
    targetUid?: string;
    seenKey: string;
  } | null>(null);
  const [seenTips, setSeenTips] = useState<Record<string, boolean>>({});

  // ----- Marquee (kutu seçim) + grup taşıma -----
  const [selectedGroup, setSelectedGroup] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<
    | { sx: number; sy: number; cx: number; cy: number }
    | null
  >(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const [groupDrag, setGroupDrag] = useState<
    | {
        startNx: number;
        startNy: number;
        curNx: number;
        curNy: number;
        origins: Record<string, { nx: number; ny: number }>;
      }
    | null
  >(null);
  const groupDragRef = useRef<typeof groupDrag>(null);
  const suppressNextClickRef = useRef(false);


  const dropRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [outerW, setOuterW] = useState(0);

  // Track container width with ResizeObserver — drives the scale factor.
  useLayoutEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Track outer scroll wrapper width — drives the sizer when zoomed.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setOuterW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);

  // Track outer scroll position so arrow overlays can hide when scroll-end reached.
  const [scrollState, setScrollState] = useState({ x: 0, y: 0, maxX: 0, maxY: 0 });
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      setScrollState({
        x: el.scrollLeft,
        y: el.scrollTop,
        maxX: Math.max(0, el.scrollWidth - el.clientWidth),
        maxY: Math.max(0, el.scrollHeight - el.clientHeight),
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [zoom, outerW]);

  // Zoom değiştiğinde görsel merkez sabit kalsın (sayfa sağ-alta atlamasın).
  const prevZoomRef = useRef(1);
  useEffect(() => {
    const el = outerRef.current;
    const prev = prevZoomRef.current;
    if (!el || prev === zoom) {
      prevZoomRef.current = zoom;
      return;
    }
    const r = zoom / prev;
    const cx = el.scrollLeft + el.clientWidth / 2;
    const cy = el.scrollTop + el.clientHeight / 2;
    const nextLeft = cx * r - el.clientWidth / 2;
    const nextTop = cy * r - el.clientHeight / 2;
    // Yeni boyut layout sonrası geçerli olduğundan bir frame bekle.
    requestAnimationFrame(() => {
      const node = outerRef.current;
      if (!node) return;
      node.scrollLeft = Math.max(0, Math.min(node.scrollWidth - node.clientWidth, nextLeft));
      node.scrollTop = Math.max(0, Math.min(node.scrollHeight - node.clientHeight, nextTop));
    });
    prevZoomRef.current = zoom;
  }, [zoom]);

  // Sürükleme başladığında zoomlu görünümü üst-orta hizaya getir (bir defa).
  const dragAutoScrolledRef = useRef(false);
  useEffect(() => {
    const anyDrag = !!(charmDrag || groupDrag || draggingUid || draggingNew);
    if (!anyDrag) {
      dragAutoScrolledRef.current = false;
      return;
    }
    if (dragAutoScrolledRef.current) return;
    const el = outerRef.current;
    if (!el || zoom <= 1 || !isMobile) return;
    dragAutoScrolledRef.current = true;
    el.scrollTop = 0;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [charmDrag, groupDrag, draggingUid, draggingNew, zoom, isMobile]);

  // Ok butonu için sürekli yumuşak kaydırma (basılı tutulduğunda).
  const panRafRef = useRef<number | null>(null);
  const startPan = (dx: number, dy: number) => {
    const el = outerRef.current;
    if (!el) return;
    // Anında küçük bir adım (kısa tık için)
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + dx * 4));
    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dy * 4));
    const step = () => {
      if (!outerRef.current) return;
      const node = outerRef.current;
      node.scrollLeft = Math.max(0, Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + dx));
      node.scrollTop = Math.max(0, Math.min(node.scrollHeight - node.clientHeight, node.scrollTop + dy));
      panRafRef.current = requestAnimationFrame(step);
    };
    panRafRef.current = requestAnimationFrame(step);
  };
  const stopPan = () => {
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
  };

  // Touch drag loupe — show magnifier above finger while dragging on touch devices.
  useEffect(() => {
    const anyDrag = !!(charmDrag || groupDrag || draggingUid);
    if (!anyDrag) {
      setLoupePos(null);
      return;
    }
    const handler = (e: PointerEvent) => {
      // Loupe sadece dokunmatik cihazlarda görünsün — masaüstünde devre dışı.
      if (e.pointerType === "mouse") return;
      setLoupePos({ x: e.clientX, y: e.clientY });
    };
    const stop = () => setLoupePos(null);
    window.addEventListener("pointermove", handler);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", handler);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [charmDrag, groupDrag, draggingUid]);


  // Tray açıkken sayfa scroll'unu kilitlemiyoruz; tray modal değil ve canvas etkileşimli kalmalı.


  const scale = containerW > 0 ? containerW / BASE_WIDTH : 1;
  const stoneSize = Math.max(18, BASE_STONE_SIZE * scale);
  const charmPxFor = (mm: number) =>
    Math.max(24, BASE_CHARM_SIZE * scale * (mm / CHARM_REFERENCE_MM));
  const charmSize = charmPxFor(CHARM_REFERENCE_MM); // legacy reference (used as fallback)
  const ropeWidth = BASE_ROPE_WIDTH; // already in SVG units → already responsive

  const chainStops =
    chainColor === "gold"
      ? { a: "#a87a1f", b: "#fff3c4", c: "#a87a1f" }
      : { a: "#9ca3af", b: "#f3f4f6", c: "#9ca3af" };

  const { data: stoneDtos } = useSuspenseQuery(stonesQueryOptions);
  const { data: charmDtos } = useSuspenseQuery(charmsQueryOptions);
  const { data: partDtos } = useSuspenseQuery(partsQueryOptions);
  const stoneItems = useMemo<Item[]>(
    () =>
      stoneDtos.map((s: StoneDTO) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        category: "stone" as const,
        render: StoneImage(s.imageUrl, lightEnabled ? lightIntensity : 0),
        sizes: s.sizes,
      })),
    [stoneDtos, lightEnabled, lightIntensity],
  );
  const charmItems = useMemo<Item[]>(
    () =>
      charmDtos.map((c: CharmDTO) => ({
        id: c.id,
        name: c.name,
        price: c.price,
        category: "charm" as const,
        render: CharmImage(c.imageUrl),
        sizeMm: c.size,
      })),
    [charmDtos],
  );
  const partItems = useMemo<Item[]>(
    () =>
      partDtos.map((p: PartDTO) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: "part" as const,
        render: CharmImage(p.imageUrl),
        sizeMm: p.size,
      })),
    [partDtos],
  );
  const itemById = (id: string): Item => {
    const found =
      stoneItems.find((s) => s.id === id) ??
      charmItems.find((c) => c.id === id) ??
      partItems.find((p) => p.id === id);
    if (!found) {
      return { id, name: "?", price: 0, category: "stone", render: () => <span /> };
    }
    return found;
  };
  const total = placed.reduce((s, p) => s + itemById(p.itemId).price, 0);

  // Build an arc-length lookup table so we can place items at equal
  // physical spacing along the curve (not equal `t`, which bunches near
  // the center of a quadratic Bézier and stretches near the ends).
  const ARC_SAMPLES = 200;
  const { arcLengthPct, arcLUT } = (() => {
    const lut: { t: number; s: number }[] = [{ t: 0, s: 0 }];
    let len = 0;
    let prev = curvePoint(0, chainLeftX, chainRightX, chainY, chainDip);
    for (let i = 1; i <= ARC_SAMPLES; i++) {
      const t = i / ARC_SAMPLES;
      const p = curvePoint(t, chainLeftX, chainRightX, chainY, chainDip);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      lut.push({ t, s: len });
      prev = p;
    }
    return { arcLengthPct: len, arcLUT: lut };
  })();

  // Arc length (in % units) → `t` on the curve, via linear interpolation.
  const sToT = (s: number) => {
    const clamped = Math.max(0, Math.min(arcLengthPct, s));
    let lo = 0;
    let hi = arcLUT.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arcLUT[mid].s < clamped) lo = mid;
      else hi = mid;
    }
    const a = arcLUT[lo];
    const b = arcLUT[hi];
    const f = b.s === a.s ? 0 : (clamped - a.s) / (b.s - a.s);
    return a.t + (b.t - a.t) * f;
  };

  // Convert a pixel size into a % of the container width (matches viewBox X).
  const pxToPct = (px: number) => (containerW > 0 ? (px / containerW) * 100 : 0);

  // Visual center-to-center spacing. The source PNGs include transparent
  // padding/shadow, so using the full element diameter creates visible gaps.
  // This factor makes stones read as touching without visually colliding.
  const minSpacingPct = (diamPx: number) => pxToPct(diamPx * STONE_TOUCH_FACTOR);

  // Per-item visual diameter (in % of container width). Stones honour their
  // individual `scale` (3/6/9mm), so capacity adapts to actual sizes.
  const itemDiamPct = (it: { itemId?: string; category: string; scale?: number }) => {
    if (it.category === "charm") {
      const mm = it.itemId ? itemById(it.itemId).sizeMm ?? CHARM_REFERENCE_MM : CHARM_REFERENCE_MM;
      return pxToPct(charmPxFor(mm));
    }
    if (it.category === "part") {
      const mm = it.itemId ? itemById(it.itemId).sizeMm ?? CHARM_REFERENCE_MM : CHARM_REFERENCE_MM;
      return pxToPct(charmPxFor(mm) * PART_SCALE);
    }
    const sc = it.scale ?? 1;
    return pxToPct(stoneSize * sc);
  };
  // Centre on the chin (x=50%), used by both layout and capacity checks.
  const centerT = Math.max(
    0,
    Math.min(1, (50 - chainLeftX) / (chainRightX - chainLeftX || 1)),
  );
  const tToSGlobal = (tt: number) => {
    if (arcLUT.length === 0) return 0;
    const idx = Math.max(0, Math.min(arcLUT.length - 1, Math.round(tt * (arcLUT.length - 1))));
    const a = arcLUT[idx];
    const b = arcLUT[Math.min(arcLUT.length - 1, idx + 1)];
    const span = b.t - a.t;
    const f = span === 0 ? 0 : (tt - a.t) / span;
    return a.s + (b.s - a.s) * f;
  };
  const centerS = tToSGlobal(centerT);

  // Does this set of chain items physically fit between the chain endpoints?
  // Mirrors layoutChain's centre-out walk so the capacity check matches reality.
  const chainFits = (items: { itemId?: string; category: string; scale?: number }[]) => {
    const n = items.length;
    if (n === 0) return true;
    const ordered = [...items];
    const charmIdx = ordered.findIndex((i) => i.category === "charm");
    if (charmIdx > 0) {
      const [c] = ordered.splice(charmIdx, 1);
      ordered.unshift(c);
    }
    const positions = new Array<number>(n);
    positions[0] = centerS;
    let prevRight = 0;
    for (let i = 2; i < n; i += 2) {
      positions[i] =
        positions[prevRight] +
        ((itemDiamPct(ordered[prevRight]) + itemDiamPct(ordered[i])) / 2) *
          STONE_TOUCH_FACTOR;
      prevRight = i;
    }
    let prevLeft = 0;
    for (let i = 1; i < n; i += 2) {
      positions[i] =
        positions[prevLeft] -
        ((itemDiamPct(ordered[prevLeft]) + itemDiamPct(ordered[i])) / 2) *
          STONE_TOUCH_FACTOR;
      prevLeft = i;
    }
    const usable = arcLengthPct * 0.99;
    for (let i = 0; i < n; i++) {
      const half = itemDiamPct(ordered[i]) / 2;
      if (positions[i] - half < 0) return false;
      if (positions[i] + half > usable) return false;
    }
    return true;
  };

  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 3500);
    return () => clearTimeout(t);
  }, [warning]);

  // Info bubble auto-dismiss after 6 seconds and mark as seen.
  useEffect(() => {
    if (!infoBubble) return;
    const t = setTimeout(() => {
      setSeenTips((s) => ({ ...s, [infoBubble.seenKey]: true }));
      setInfoBubble(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [infoBubble]);

  // When 3-5 stones are on the chain, remind that double-click deletes.
  const stoneCount = placed.filter((p) => p.category === "stone" && p.t !== undefined).length;
  useEffect(() => {
    if (stoneCount >= 3 && stoneCount <= 5 && !seenTips.stoneDelete) {
      setInfoBubble({
        text: "Artık taşlara çift tıklayarak istemediğin taşı kaldırabilirsin.",
        seenKey: "stoneDelete",
      });
    }
  }, [stoneCount, seenTips.stoneDelete]);

  const stonesLocked = chainStyle === "paperclip";
  const stonesLockedMessage = "Taş eklemek için zincir tipini Misina olarak değiştirmelisiniz.";
  useEffect(() => {
    if (chainStyle === "paperclip" && !seenTips.paperclipInfo) {
      setInfoBubble({
        text: "Zincire sadece charm ve takı parçaları eklenebilir.",
        seenKey: "paperclipInfo",
      });
    }
  }, [chainStyle, seenTips.paperclipInfo]);



  // stones expand outward in the order [0, -1, +1, -2, +2, ...] with
  // adaptive spacing based on physical stone size.
  const layoutChain = (items: Placed[]): Placed[] => {
    const n = items.length;
    if (n === 0) return [];
    const ordered = [...items];
    const charmIdx = ordered.findIndex((i) => i.category === "charm");
    if (charmIdx > 0) {
      const [c] = ordered.splice(charmIdx, 1);
      ordered.unshift(c);
    }
    // Per-item diameter (in % units) so mixed 3/6/9mm stones touch correctly.
    const itemDiamPct = (it: Placed) => {
      if (it.category === "charm") {
        const mm = itemById(it.itemId).sizeMm ?? CHARM_REFERENCE_MM;
        return pxToPct(charmPxFor(mm));
      }
      if (it.category === "part") {
        const mm = itemById(it.itemId).sizeMm ?? CHARM_REFERENCE_MM;
        return pxToPct(charmPxFor(mm) * PART_SCALE);
      }
      const sc = it.scale ?? 1;
      return pxToPct(stoneSize * sc);
    };
    // Center on the chin (x = 50%), not the midpoint between chain endpoints,
    // so asymmetric left/right slider values still distribute around the face.
    const centerT = Math.max(
      0,
      Math.min(1, (50 - chainLeftX) / (chainRightX - chainLeftX || 1)),
    );
    const tToS = (tt: number) => {
      const idx = Math.max(0, Math.min(arcLUT.length - 1, Math.round(tt * (arcLUT.length - 1))));
      const a = arcLUT[idx];
      const b = arcLUT[Math.min(arcLUT.length - 1, idx + 1)];
      const span = b.t - a.t;
      const f = span === 0 ? 0 : (tt - a.t) / span;
      return a.s + (b.s - a.s) * f;
    };
    const centerS = tToS(centerT);
    const minS = pxToPct(stoneSize) / 2;
    const maxS = arcLengthPct - minS;

    // Walk outward from center; each gap is the average of the two
    // neighbours' diameters * touch factor, so adjacent stones always touch.
    const positions = new Array<number>(n);
    positions[0] = centerS;
    let prevRight = 0;
    for (let i = 2; i < n; i += 2) {
      const gap =
        ((itemDiamPct(ordered[prevRight]) + itemDiamPct(ordered[i])) / 2) *
        STONE_TOUCH_FACTOR;
      positions[i] = positions[prevRight] + gap;
      prevRight = i;
    }
    let prevLeft = 0;
    for (let i = 1; i < n; i += 2) {
      const gap =
        ((itemDiamPct(ordered[prevLeft]) + itemDiamPct(ordered[i])) / 2) *
        STONE_TOUCH_FACTOR;
      positions[i] = positions[prevLeft] - gap;
      prevLeft = i;
    }

    return ordered.map((item, i) => {
      const s = Math.max(minS, Math.min(maxS, positions[i]));
      return { ...item, t: sToT(s) };
    });
  };

  // When the chain shrinks (slider changes) or stone sizes grow, drop the
  // outermost stones until the rest physically fit between the endpoints.
  useEffect(() => {
    setPlaced((prev) => {
      const chainItems = prev.filter((p) => p.t !== undefined);
      const others = prev.filter((p) => p.t === undefined);
      if (chainFits(chainItems)) return prev;
      // layoutChain orders by center-out, so trailing items are the outermost.
      let kept = layoutChain(chainItems);
      let removed = 0;
      while (kept.length > 0 && !chainFits(kept)) {
        kept = kept.slice(0, -1);
        removed++;
      }
      setWarning(`Kolye kısaldı — sığmayan ${removed} taş kaldırıldı.`);
      return [...others, ...layoutChain(kept)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcLengthPct, stoneSize, scale, charmItems, partItems]);

  // Click-to-add: stones thread onto the chain; charms float freely.
  const addToChain = (item: Item, stoneSize?: number) => {
    const stoneScale = item.category === "stone" && stoneSize ? STONE_SIZE_SCALE[stoneSize] : undefined;

    if (item.category === "stone" && stonesLocked) {
      setWarning(stonesLockedMessage);
      return;
    }

    if (item.category !== "stone") {
      snapshot();
      setPlaced((prev) => {
        const sel = selectedUid ? prev.find((p) => p.uid === selectedUid) : null;
        if (sel && sel.category !== "stone") {
          const swapped: Placed[] = prev.map((p) =>
            p.uid === selectedUid
              ? { ...p, itemId: item.id, category: item.category, scale: item.category === "part" ? PART_SCALE : p.scale }
              : p,
          );
          setSelectedUid(null);
          return swapped;
        }
        const newOne: Placed = {
          uid: crypto.randomUUID(),
          itemId: item.id,
          category: item.category,
          nx: 0.5,
          ny: 0.55,
          scale: item.category === "part" ? PART_SCALE : undefined,
        };
        setSelectedUid(null);
        return [...prev, newOne];
      });
      return;
    }

    const swapping = !!(selectedUid && placed.some((p) => p.uid === selectedUid && p.category === "stone"));
    if (!swapping) {
      const chainItems = placed.filter((p) => p.t !== undefined);
      const candidate = { category: "stone", scale: stoneScale ?? 1 };
      if (!chainFits([...chainItems, candidate])) {
        setWarning("Bu kolye tasarımı için önerilen taş sayısına ulaştınız.");
        return;
      }
    }
    snapshot();
    setPlaced((prev) => {
      if (selectedUid && prev.some((p) => p.uid === selectedUid && p.category === "stone")) {
        const swapped: Placed[] = prev.map((p) =>
          p.uid === selectedUid
            ? { ...p, itemId: item.id, category: item.category, scale: stoneScale ?? p.scale }
            : p,
        );
        setSelectedUid(null);
        const chainItems = swapped.filter((p) => p.t !== undefined);
        const others = swapped.filter((p) => p.t === undefined);
        return [...others, ...layoutChain(chainItems)];
      }
      const chainItems = prev.filter((p) => p.t !== undefined);
      const others = prev.filter((p) => p.t === undefined);
      const newOne: Placed = {
        uid: crypto.randomUUID(),
        itemId: item.id,
        category: item.category,
        t: 0.5,
        scale: stoneScale,
      };
      return [...others, ...layoutChain([...chainItems, newOne])];
    });
  };

  const removePlaced = (uid: string) => {
    snapshot();
    setPlaced((prev) => {
      const kept = prev.filter((p) => p.uid !== uid);
      const chainItems = kept.filter((p) => p.t !== undefined);
      const others = kept.filter((p) => p.t === undefined);
      return [...others, ...layoutChain(chainItems)];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = dropRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (draggingNew) {
      snapshot();
      setPlaced((p) => [
        ...p,
        {
          uid: crypto.randomUUID(),
          itemId: draggingNew.id,
          category: draggingNew.category,
          nx,
          ny,
          scale: draggingNew.category === "part" ? PART_SCALE : undefined,
        },
      ]);
      setDraggingNew(null);
    } else if (draggingUid) {
      snapshot();
      setPlaced((p) =>
        p.map((it) =>
          it.uid === draggingUid ? { ...it, nx, ny, t: undefined } : it,
        ),
      );
      setDraggingUid(null);
    }
  };

  const stones = stoneItems;
  const charms = charmItems;
  const parts = partItems;
  const selectedPlaced = selectedUid ? placed.find((p) => p.uid === selectedUid) : null;
  const selectedIsCharm = selectedPlaced?.category === "charm";
  const setSelectedScale = (s: number) => {
    if (!selectedPlaced || selectedPlaced.category === "part") return;
    setPlaced((arr) =>
      arr.map((it) => (it.uid === selectedPlaced.uid ? { ...it, scale: s } : it)),
    );
  };

  const renderPlaced = (p: Placed) => {
    const item = itemById(p.itemId);
    const isFree = p.category !== "stone";
    const isDraggingThis = charmDrag?.uid === p.uid;
    const inGroup = selectedGroup.has(p.uid);
    const isGroupDragging = !!groupDrag && inGroup;
    let xPct: number;
    let yPct: number;
    if (isGroupDragging && groupDrag) {
      const origin = groupDrag.origins[p.uid];
      const dx = groupDrag.curNx - groupDrag.startNx;
      const dy = groupDrag.curNy - groupDrag.startNy;
      xPct = Math.max(0, Math.min(1, origin.nx + dx)) * 100;
      yPct = Math.max(0, Math.min(1, origin.ny + dy)) * 100;
    } else if (isDraggingThis && charmDrag) {
      xPct = charmDrag.nx * 100;
      yPct = charmDrag.ny * 100;
    } else if (p.t !== undefined) {
      const { x, y } = curvePoint(p.t, chainLeftX, chainRightX, chainY, chainDip);
      xPct = x;
      yPct = y;
    } else {
      xPct = (p.nx ?? 0.5) * 100;
      yPct = (p.ny ?? 0.5) * 100;
    }
    const charmMm = item.sizeMm ?? CHARM_REFERENCE_MM;
    const baseSize = isFree ? charmPxFor(charmMm) : stoneSize;
    const size = baseSize * (p.category === "part" ? PART_SCALE : (p.scale ?? 1));
    const isSelected = selectedUid === p.uid;

    // Group-drag aware pointer handlers (only for free items that are part of
    // an active multi-selection — falls back to single-item drag otherwise).
    const startGroupDrag = (e: React.PointerEvent) => {
      const rect = dropRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const origins: Record<string, { nx: number; ny: number }> = {};
      for (const it of placed) {
        if (!selectedGroup.has(it.uid)) continue;
        if (it.t !== undefined) continue;
        origins[it.uid] = { nx: it.nx ?? 0.5, ny: it.ny ?? 0.5 };
      }
      const next = { startNx: nx, startNy: ny, curNx: nx, curNy: ny, origins };
      groupDragRef.current = next;
      setGroupDrag(next);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    };

    return (
      <div
        key={p.uid}
        data-placed="1"
        onPointerDown={(e) => {
          if (!isFree) return;
          if (e.button !== undefined && e.button !== 0) return;
          e.stopPropagation(); // prevent container marquee from starting
          if (inGroup && selectedGroup.size > 1) {
            startGroupDrag(e);
            return;
          }
          const rect = dropRef.current?.getBoundingClientRect();
          if (!rect) return;
          const cursorNx = (e.clientX - rect.left) / rect.width;
          const cursorNy = (e.clientY - rect.top) / rect.height;
          let startNx: number;
          let startNy: number;
          if (p.t !== undefined) {
            const cp = curvePoint(p.t, chainLeftX, chainRightX, chainY, chainDip);
            startNx = cp.x / 100;
            startNy = cp.y / 100;
          } else {
            startNx = p.nx ?? cursorNx;
            startNy = p.ny ?? cursorNy;
          }
          const next = {
            uid: p.uid,
            nx: startNx,
            ny: startNy,
            offX: cursorNx - startNx,
            offY: cursorNy - startNy,
          };
          charmDragRef.current = next;
          setCharmDrag(next);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          // Group drag in progress?
          const gd = groupDragRef.current;
          if (gd && isFree) {
            const rect = dropRef.current?.getBoundingClientRect();
            if (!rect) return;
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            const next = { ...gd, curNx: nx, curNy: ny };
            groupDragRef.current = next;
            setGroupDrag(next);
            return;
          }
          const cur = charmDragRef.current;
          if (!isFree || !cur || cur.uid !== p.uid) return;
          const rect = dropRef.current?.getBoundingClientRect();
          if (!rect) return;
          const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width - cur.offX));
          const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height - cur.offY));
          const next = { ...cur, nx, ny };
          charmDragRef.current = next;
          setCharmDrag(next);
        }}
        onPointerUp={(e) => {
          // Finalize group drag
          const gd = groupDragRef.current;
          if (gd && isFree) {
            try {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            } catch { /* noop */ }
            const dx = gd.curNx - gd.startNx;
            const dy = gd.curNy - gd.startNy;
            const moved = Math.abs(dx) > 0.003 || Math.abs(dy) > 0.003;
            if (moved) {
              snapshot();
              setPlaced((arr) =>
                arr.map((it) => {
                  const origin = gd.origins[it.uid];
                  if (!origin) return it;
                  return {
                    ...it,
                    nx: Math.max(0, Math.min(1, origin.nx + dx)),
                    ny: Math.max(0, Math.min(1, origin.ny + dy)),
                    t: undefined,
                  };
                }),
              );
              suppressNextClickRef.current = true;
            }
            groupDragRef.current = null;
            setGroupDrag(null);
            return;
          }
          const cur = charmDragRef.current;
          if (!isFree || !cur || cur.uid !== p.uid) return;
          const finalNx = cur.nx;
          const finalNy = cur.ny;
          try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          const dxStart = Math.abs(finalNx - (p.t !== undefined
            ? curvePoint(p.t, chainLeftX, chainRightX, chainY, chainDip).x / 100
            : (p.nx ?? 0.5)));
          const dyStart = Math.abs(finalNy - (p.t !== undefined
            ? curvePoint(p.t, chainLeftX, chainRightX, chainY, chainDip).y / 100
            : (p.ny ?? 0.5)));
          const isTap = dxStart < 0.005 && dyStart < 0.005;
          snapshot();
          setPlaced((arr) =>
            arr.map((it) =>
              it.uid === p.uid
                ? { ...it, nx: finalNx, ny: finalNy, t: undefined }
                : it,
            ),
          );
          if (isTap) {
            if (tryDoubleTap(p.uid)) {
              charmDragRef.current = null;
              setCharmDrag(null);
              return;
            }
            setSelectedUid((cur2) => (cur2 === p.uid ? null : p.uid));
            // Tapping outside a group clears the group selection
            if (!inGroup) setSelectedGroup(new Set());
          } else {
            setSelectedUid(null);
          }
          charmDragRef.current = null;
          setCharmDrag(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isFree) return; // selection handled in pointerup
          if (tryDoubleTap(p.uid)) return;
          setSelectedUid((cur) => (cur === p.uid ? null : p.uid));
          setSelectedGroup(new Set());
          if (!isFree && !seenTips.stoneChange) {
            const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
            setInfoBubble({
              text: isMobile
                ? "Taşa tıklayıp, aşağıdan seçtiğin taştan değiştirebilirsin."
                : "Taşa tıklayıp, sol/sağ panelden istediğin taşı seçerek değiştirebilirsin.",
              targetUid: p.uid,
              seenKey: "stoneChange",
            });
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          removePlaced(p.uid);
        }}
        title={
          p.category === "part"
            ? `${item.name} — tut ve sürükle, çift tıklayarak kaldır`
            : isFree
            ? `${item.name} — tut ve sürükle, tıkla seç (boyutlandır), çift tıklayarak kaldır`
            : `${item.name} — tıkla seç, soldan/sağdan başka taş seçerek değiştir, çift tıklayarak kaldır`
        }
        className={`absolute -translate-x-1/2 -translate-y-1/2 touch-none ${
          isFree ? "" : "rounded-full"
        } ${
          isFree ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${p.category === "part" ? "z-0" : "z-[5]"} ${isSelected ? "stone-glow z-10" : ""} ${
          isDraggingThis || isGroupDragging ? "charm-dragging z-20" : ""
        } ${inGroup ? "ring-2 ring-amber-400/80 ring-offset-1 ring-offset-stone-100 rounded-md z-10" : ""}`}
        style={{
          left: `${xPct}%`,
          top: `${yPct}%`,
        }}
      >
        {item.render(size, xPct / 100, yPct / 100)}
      </div>
    );
  };


  const renderInfoBubble = () => {
    if (!infoBubble) return null;
    let left = "50%";
    let top = "55%";
    let showArrow = false;
    if (infoBubble.targetUid) {
      const p = placed.find((x) => x.uid === infoBubble.targetUid);
      if (p && p.t !== undefined) {
        const { x, y } = curvePoint(p.t, chainLeftX, chainRightX, chainY, chainDip);
        left = `${x}%`;
        top = `${y - 9}%`;
        showArrow = true;
      }
    }
    return (
      <div
        className="absolute z-40 max-w-[16rem] animate-in fade-in zoom-in-95"
        style={{ left, top, transform: "translate(-50%, -100%)" }}
        onClick={(e) => {
          e.stopPropagation();
          setSeenTips((s) => ({ ...s, [infoBubble.seenKey]: true }));
          setInfoBubble(null);
        }}
      >
        <div className="relative rounded-xl border border-stone-300 bg-white/95 p-3 text-xs text-stone-800 shadow-xl backdrop-blur">
          <div className="flex items-start gap-2">
            <span className="text-base leading-none">💡</span>
            <p className="leading-snug">{infoBubble.text}</p>
          </div>
          <div className="mt-2 text-right">
            <button className="text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-800">
              Anladım
            </button>
          </div>
          {showArrow && (
            <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-stone-300 bg-white/95" />
          )}
        </div>
      </div>
    );
  };

  // Canvas içeriği — hem ana tuvalde hem büyüteç (loupe) içinde aynı render edilsin diye dışarı alındı.
  const canvasInner = (
    <>
      <img
        src={neckImg}
        alt="Model boyun"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        draggable={false}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <linearGradient id="chain" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={chainStops.a} />
            <stop offset="50%" stopColor={chainStops.b} />
            <stop offset="100%" stopColor={chainStops.c} />
          </linearGradient>
        </defs>
        {chainStyle === "rope" ? (
          <>
            <path
              d={`M ${chainLeftX},${chainY} Q ${(chainLeftX + chainRightX) / 2},${chainDip} ${chainRightX},${chainY}`}
              fill="none"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={ropeWidth + 0.15}
              strokeLinecap="round"
              transform="translate(0,0.6)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`M ${chainLeftX},${chainY} Q ${(chainLeftX + chainRightX) / 2},${chainDip} ${chainRightX},${chainY}`}
              fill="none"
              stroke="url(#chain)"
              strokeWidth={ropeWidth}
              strokeLinecap="round"
              strokeDasharray="0.5 0.35"
            />
          </>
        ) : (
          <PaperclipChain
            leftX={chainLeftX}
            rightX={chainRightX}
            y={chainY}
            dip={chainDip}
            color={chainColor}
            baseWidth={ropeWidth}
          />
        )}
      </svg>
      {placed.filter((p) => p.category !== "stone").map((p) => renderPlaced(p))}
      {placed.filter((p) => p.category === "stone").map((p) => renderPlaced(p))}
    </>
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-stone-50 via-stone-100 to-stone-200 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-300/60 bg-white/80 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl tracking-tight sm:text-2xl">Elzem Tasarım Atölyesi</h1>
            <p className="hidden text-[10px] uppercase tracking-[0.25em] text-stone-500 sm:block">
              Kendi tasarımını yarat
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setGalleryOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 active:scale-95 sm:text-sm"
              title="Tasarımlarımı aç / kaydet"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              <span className="hidden sm:inline">Tasarımlarım</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2 py-1">
              <button
                type="button"
                onClick={() => setLightEnabled((v) => !v)}
                title={lightEnabled ? "Işığı kapat" : "Işığı aç"}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  lightEnabled
                    ? "bg-amber-400 text-stone-900 shadow-inner"
                    : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                }`}
                aria-label="Işık aç/kapat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.4 1 1 1 1.7V18h6v-1.6c0-.7.4-1.3 1-1.7A7 7 0 0 0 12 2Z"/></svg>
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(lightIntensity * 100)}
                onChange={(e) => setLightIntensity(Number(e.target.value) / 100)}
                disabled={!lightEnabled}
                aria-label="Işık gücü"
                title={`Işık gücü: %${Math.round(lightIntensity * 100)}`}
                className={`w-16 accent-amber-500 sm:w-24 ${lightEnabled ? "" : "opacity-40"}`}
              />
              <span className="hidden min-w-[2.25rem] text-right text-[10px] tabular-nums text-stone-600 sm:inline">
                %{Math.round(lightIntensity * 100)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-stone-500">Toplam</div>
                <div className="font-serif text-2xl tabular-nums sm:text-3xl">
                  {total.toLocaleString("tr-TR")} ₺
                </div>
              </div>
              <button
                type="button"
                disabled={paying || placed.length === 0 || total <= 0}
                onClick={async () => {
                  setPaying(true);
                  setPayError(null);
                  try {
                    const items = placed.map((p) => {
                      const it = itemById(p.itemId);
                      return { id: it.id, name: it.name, price: it.price };
                    });
                    const res = await fetch("/api/iyzico-checkout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ total, items }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.paymentPageUrl) {
                      throw new Error(data.error || "Ödeme başlatılamadı");
                    }
                    clearDraft();
                    window.location.href = data.paymentPageUrl;
                  } catch (e) {
                    setPayError(e instanceof Error ? e.message : "Bir hata oluştu");
                    setPaying(false);
                  }
                }}
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2.5"
                title="iyzico ile öde"
              >
                {paying ? "Yönlendiriliyor…" : "Ödeme Yap"}
              </button>
            </div>
            {payError && (
              <div className="col-span-2 -mt-1 text-right text-xs text-red-600">{payError}</div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6 lg:grid-cols-[200px_minmax(0,1fr)_200px]">
        {/* Left tray — stones (desktop) */}
        <div className="hidden lg:block">
          <Tray
            title="Taşlar"
            items={stones}
            onDragStart={setDraggingNew}
            onPick={addToChain}
            disabled={stonesLocked}
            onDisabledAttempt={() => setWarning(stonesLockedMessage)}
          />
        </div>

        {/* Center — model */}
        <main className="min-w-0">
          <div className="relative mx-auto max-w-[512px]" style={{ contain: "layout paint", isolation: "isolate" }}>
          {/* Mobil-only sağ üst aksiyon butonları: outerRef DIŞINDA — zoom/scroll'dan etkilenmez */}
          <div className="pointer-events-none absolute right-2 top-2 z-30 flex gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white/90 text-stone-800 shadow-md backdrop-blur active:scale-95 disabled:opacity-40"
              aria-label="Geri al"
              title="Geri al"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/></svg>
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={placed.length === 0}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-rose-300 bg-white/90 text-rose-700 shadow-md backdrop-blur active:scale-95 disabled:opacity-40"
              aria-label="Tümünü sil"
              title="Tümünü sil"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
          <div
            ref={outerRef}
            className="relative mx-auto max-h-[78dvh] max-w-[512px] overflow-auto overscroll-contain rounded-2xl"
            style={{ touchAction: "pan-x pan-y" }}
          >
          <div style={{ width: outerW ? outerW * zoom : "100%", height: outerW ? outerW * zoom * 4 / 3 : undefined }}>

          <div
            ref={dropRef}
            id="bk-canvas-capture"
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: outerW || "100%",
              height: outerW ? outerW * 4 / 3 : undefined,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onPointerDown={(e) => {
              // Only start marquee when clicking on the empty background
              // (image / svg / container itself — not on a placed item).
              const target = e.target as Element;
              if (target.closest("[data-placed='1']")) return;
              if (e.button !== undefined && e.button !== 0) return;
              const rect = dropRef.current?.getBoundingClientRect();
              if (!rect) return;
              const nx = (e.clientX - rect.left) / rect.width;
              const ny = (e.clientY - rect.top) / rect.height;
              const m = { sx: nx, sy: ny, cx: nx, cy: ny };
              marqueeRef.current = m;
              setMarquee(m);
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const m = marqueeRef.current;
              if (!m) return;
              const rect = dropRef.current?.getBoundingClientRect();
              if (!rect) return;
              const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
              const next = { ...m, cx: nx, cy: ny };
              marqueeRef.current = next;
              setMarquee(next);
            }}
            onPointerUp={(e) => {
              const m = marqueeRef.current;
              if (!m) return;
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
              } catch { /* noop */ }
              const minX = Math.min(m.sx, m.cx);
              const maxX = Math.max(m.sx, m.cx);
              const minY = Math.min(m.sy, m.cy);
              const maxY = Math.max(m.sy, m.cy);
              const dragged = Math.abs(m.cx - m.sx) > 0.01 || Math.abs(m.cy - m.sy) > 0.01;
              marqueeRef.current = null;
              setMarquee(null);
              if (!dragged) return; // just a click — let onClick handle clearing
              const picked = new Set<string>();
              for (const p of placed) {
                if (p.category === "stone") continue; // sadece charm + part
                if (p.t !== undefined) continue;       // sadece serbest olanlar
                const px = p.nx ?? 0.5;
                const py = p.ny ?? 0.5;
                if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                  picked.add(p.uid);
                }
              }
              setSelectedGroup(picked);
              setSelectedUid(null);
              suppressNextClickRef.current = true;
            }}
            onClick={() => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                return;
              }
              setSelectedUid(null);
              setSelectedGroup(new Set());
              if (infoBubble) {
                setSeenTips((s) => ({ ...s, [infoBubble.seenKey]: true }));
                setInfoBubble(null);
              }
            }}
            className="relative mx-auto aspect-[3/4] w-full max-w-[512px] touch-none select-none overflow-hidden rounded-2xl border border-stone-300 bg-stone-100 shadow-2xl"
          >
            {canvasInner}


            {/* Marquee (kutu seçim) */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-30 border border-amber-400 bg-amber-300/15"
                style={{
                  left: `${Math.min(marquee.sx, marquee.cx) * 100}%`,
                  top: `${Math.min(marquee.sy, marquee.cy) * 100}%`,
                  width: `${Math.abs(marquee.cx - marquee.sx) * 100}%`,
                  height: `${Math.abs(marquee.cy - marquee.sy) * 100}%`,
                }}
              />
            )}

            {placed.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 hidden text-center text-[10px] uppercase tracking-[0.3em] text-white drop-shadow-lg sm:block">
                Yanlardan ekleyin
              </div>
            )}

            {warning && (
              <div className="absolute inset-x-3 top-3 rounded-lg bg-stone-900/90 px-3 py-2 text-center text-[11px] font-medium text-white shadow-lg">
                {warning}
              </div>
            )}

            {renderInfoBubble()}
          </div>
          </div>
          </div>

          {/* Zoomda yön okları — sadece zoom > 1 ve o yönde scroll mümkünken görünür */}
          {zoom > 1 && scrollState.maxY > 0 && scrollState.y > 0 && (
            <button
              type="button"
              aria-label="Yukarı kaydır"
              onPointerDown={(e) => { e.preventDefault(); startPan(0, -3); }}
              onPointerUp={stopPan}
              onPointerLeave={stopPan}
              onPointerCancel={stopPan}
              className="pointer-events-auto absolute left-1/2 top-2 z-20 flex lg:hidden h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-stone-300 bg-white/85 text-stone-700 shadow-md backdrop-blur active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15"/></svg>
            </button>
          )}
          {zoom > 1 && scrollState.maxY > 0 && scrollState.y < scrollState.maxY && (
            <button
              type="button"
              aria-label="Aşağı kaydır"
              onPointerDown={(e) => { e.preventDefault(); startPan(0, 3); }}
              onPointerUp={stopPan}
              onPointerLeave={stopPan}
              onPointerCancel={stopPan}
              className="pointer-events-auto absolute bottom-2 left-1/2 z-20 flex lg:hidden h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-stone-300 bg-white/85 text-stone-700 shadow-md backdrop-blur active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
          {zoom > 1 && scrollState.maxX > 0 && scrollState.x > 0 && (
            <button
              type="button"
              aria-label="Sola kaydır"
              onPointerDown={(e) => { e.preventDefault(); startPan(-3, 0); }}
              onPointerUp={stopPan}
              onPointerLeave={stopPan}
              onPointerCancel={stopPan}
              className="pointer-events-auto absolute left-2 top-1/2 z-20 flex lg:hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-300 bg-white/85 text-stone-700 shadow-md backdrop-blur active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18"/></svg>
            </button>
          )}
          {zoom > 1 && scrollState.maxX > 0 && scrollState.x < scrollState.maxX && (
            <button
              type="button"
              aria-label="Sağa kaydır"
              onPointerDown={(e) => { e.preventDefault(); startPan(3, 0); }}
              onPointerUp={stopPan}
              onPointerLeave={stopPan}
              onPointerCancel={stopPan}
              className="pointer-events-auto absolute right-2 top-1/2 z-20 flex lg:hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-300 bg-white/85 text-stone-700 shadow-md backdrop-blur active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
            </button>
          )}
          </div>

          {/* Mobil: Taşlar / Charmlar / Parçalar — görüntü ile zincir ayarları arasında sabit */}
          <div className="sticky top-[60px] z-20 -mx-3 mt-3 border-y border-stone-300/60 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  if (stonesLocked) {
                    setWarning(stonesLockedMessage);
                    return;
                  }
                  setTrayOpen((t) => (t === "stones" ? null : "stones"));
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium active:scale-[0.98] ${trayOpen === "stones" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800"} ${stonesLocked ? "opacity-50" : ""}`}
              >
                Taşlar
              </button>
              <button
                onClick={() => setTrayOpen((t) => (t === "charms" ? null : "charms"))}
                className={`rounded-lg border px-3 py-2 text-sm font-medium active:scale-[0.98] ${trayOpen === "charms" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800"}`}
              >
                Charmlar
              </button>
              <button
                onClick={() => setTrayOpen((t) => (t === "parts" ? null : "parts"))}
                className={`rounded-lg border px-3 py-2 text-sm font-medium active:scale-[0.98] ${trayOpen === "parts" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800"}`}
              >
                Parçalar
              </button>
            </div>
          </div>





          {/* Zoom kontrolü (yalnız desktop) */}
          <div className="mt-3 hidden lg:flex flex-col gap-2 rounded-xl border border-stone-300 bg-white/80 px-3 py-2 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-stone-600">Zoom</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 active:scale-95"
                  aria-label="Uzaklaştır"
                >
                  −
                </button>
                <span className="min-w-[3rem] text-center text-[11px] font-medium tabular-nums text-stone-700">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 active:scale-95"
                  aria-label="Yakınlaştır"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100 active:scale-95"
                >
                  Sıfırla
                </button>
              </div>
            </div>
          </div>


          <div className="mt-3 space-y-2 rounded-xl border border-stone-300 bg-white/80 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] uppercase tracking-widest text-stone-600">Renk</span>
              <div className="flex gap-2">
                {(["silver", "gold"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setChainColor(c)}
                    className={`rounded-md border px-3 py-1 text-[11px] font-medium transition ${
                      chainColor === c
                        ? "border-stone-700 bg-stone-900 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <span
                      className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle"
                      style={{
                        background:
                          c === "gold"
                            ? "linear-gradient(135deg,#a87a1f,#fff3c4,#a87a1f)"
                            : "linear-gradient(135deg,#9ca3af,#f3f4f6,#9ca3af)",
                      }}
                    />
                    {c === "gold" ? "Altın" : "Gümüş"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] uppercase tracking-widest text-stone-600">Tip</span>
              <div className="flex gap-2">
                {(["rope", "paperclip"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setChainStyle(s)}
                    className={`rounded-md border px-3 py-1 text-[11px] font-medium transition ${
                      chainStyle === s
                        ? "border-stone-700 bg-stone-900 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {s === "rope" ? "Misina" : "Zincir"}
                  </button>
                ))}
              </div>
            </div>

            <SliderRow label="Sarkma derinliği" min={70} max={110} value={chainDip} onChange={setChainDip} />
            <SliderRow label="Sol uç X" min={5} max={40} value={chainLeftX} onChange={setChainLeftX} />
            <SliderRow label="Sağ uç X" min={60} max={95} value={chainRightX} onChange={setChainRightX} />
            <SliderRow label="Yükseklik (Y)" min={25} max={65} value={chainY} onChange={setChainY} />
          </div>

          {selectedIsCharm && selectedPlaced && (
            <div className="mt-3 rounded-xl border border-stone-300 bg-white/80 p-3 backdrop-blur">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-stone-600">
                  Seçili: {itemById(selectedPlaced.itemId).name}
                </span>
                <button
                  onClick={() => setSelectedUid(null)}
                  className="text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-800"
                >
                  Seçimi bırak
                </button>
              </div>
              <label className="flex items-center justify-between gap-4">
                <span className="text-[10px] uppercase tracking-widest text-stone-600">Boyut</span>
                <div className="flex items-center gap-3">
                  <span className="min-w-[2.5rem] text-right text-[11px] tabular-nums font-medium text-stone-800">
                    {Math.round((selectedPlaced.scale ?? 1) * 100)}%
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={250}
                    value={Math.round((selectedPlaced.scale ?? 1) * 100)}
                    onChange={(e) => setSelectedScale(Number(e.target.value) / 100)}
                    className="w-36 accent-stone-600 sm:w-52"
                  />
                </div>
              </label>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 text-[11px] leading-snug text-stone-500 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:text-xs">
            <span className="min-w-0">
              <span className="lg:hidden">
                İpucu: taşa tıkla (parlar), sonra alttaki <b>Taşlar</b> sekmesinden yeni taş seçerek değiştir. Çift tıklayarak silebilirsin.
              </span>
              <span className="hidden lg:inline">
                İpucu: taşa tıkla (parlar), sonra soldan/sağdan yeni taş seçerek değiştir. 3-5 taş sonrası taşlara çift tıklayarak silebilirsin.
              </span>
            </span>
          </div>
        </main>

        {/* Right tray — charms + parts (desktop) */}
        <div className="hidden space-y-4 lg:block">
          <Tray title="Charmlar" items={charms} onDragStart={setDraggingNew} onPick={addToChain} />
          <Tray title="Takı Parçaları" items={parts} onDragStart={setDraggingNew} onPick={addToChain} />
        </div>
      </div>

      {/* Mobil seçim çubuğu: tıklanan parça için Değiştir + Sil */}
      {selectedPlaced && (
        <div className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 lg:hidden pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-stone-300 bg-white/95 px-2 py-1.5 shadow-xl backdrop-blur">
            <span className="px-2 text-[11px] font-medium text-stone-700">
              {itemById(selectedPlaced.itemId).name}
            </span>
            <button
              type="button"
              onClick={() => {
                const cat = selectedPlaced.category;
                setTrayOpen(cat === "stone" ? "stones" : cat === "charm" ? "charms" : "parts");
              }}
              className="flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              Değiştir
            </button>
            <button
              type="button"
              onClick={() => {
                removePlaced(selectedPlaced.uid);
                setSelectedUid(null);
              }}
              className="flex items-center gap-1 rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 active:scale-95"
              aria-label="Sil"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              Sil
            </button>
          </div>
        </div>
      )}

      {/* Sürükleme büyüteci (mobil/dokunmatik) */}
      {loupePos && (() => {
        const R = 60; // yarıçap
        const Z = 2;  // yakınlaştırma
        const rect = dropRef.current?.getBoundingClientRect();
        if (!rect) return null;
        // Sürüklenen öğenin canvas üzerindeki merkezi (nx,ny ∈ [0,1])
        let nx: number | null = null;
        let ny: number | null = null;
        if (charmDrag) {
          nx = charmDrag.nx;
          ny = charmDrag.ny;
        } else if (groupDrag) {
          nx = groupDrag.curNx;
          ny = groupDrag.curNy;
        } else if (draggingUid) {
          const p = placed.find((x) => x.uid === draggingUid);
          if (p) { nx = p.nx ?? 0.5; ny = p.ny ?? 0.5; }
        }
        // Tepsiden yeni öğe ya da yedek: parmak konumu
        const cx = nx != null ? nx * rect.width : loupePos.x - rect.left;
        const cy = ny != null ? ny * rect.height : loupePos.y - rect.top;
        // Loupe her zaman ekranın üst-ortasında sabit
        const top = 80;
        const left = Math.max(8, Math.min(window.innerWidth - R * 2 - 8, window.innerWidth / 2 - R));
        return (
          <div
            className="pointer-events-none fixed z-[60] rounded-full border-2 border-amber-400 bg-stone-100 shadow-2xl overflow-hidden"
            style={{ top, left, width: R * 2, height: R * 2 }}
          >
            <div
              style={{
                position: "relative",
                width: rect.width,
                height: rect.height,
                transform: `translate(${R - cx * Z}px, ${R - cy * Z}px) scale(${Z})`,
                transformOrigin: "0 0",
                pointerEvents: "none",
              }}
            >
              {canvasInner}
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500" />
          </div>
        );
      })()}




      {/* Mobile bottom-sheet — modal değil; canvas etkileşimli kalır */}
      {trayOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden pointer-events-none">
          <div className="pointer-events-auto mx-auto max-h-[42dvh] overflow-y-auto rounded-t-2xl border-t border-stone-300 bg-white/95 p-3 shadow-2xl backdrop-blur">
            <div className="relative">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-stone-300" />
              <button
                type="button"
                onClick={() => setTrayOpen(null)}
                aria-label="Kapat"
                className="absolute -top-1 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm active:scale-95"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <Tray
              title={trayOpen === "stones" ? "Taşlar" : trayOpen === "charms" ? "Charmlar" : "Takı Parçaları"}
              items={trayOpen === "stones" ? stones : trayOpen === "charms" ? charms : parts}
              onDragStart={setDraggingNew}
              onPick={(it, stoneSize) => {
                addToChain(it, stoneSize);
              }}
              variant="sheet"
            />
          </div>
        </div>
      )}
      <SavedDesignsDialog
        open={galleryOpen}
        currentDesign={currentDesign}
        hasContent={placed.length > 0}
        onClose={() => setGalleryOpen(false)}
        onLoad={loadFromGallery}
      />
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-[10px] uppercase tracking-widest text-stone-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="min-w-[1.5rem] text-right text-[11px] tabular-nums font-medium text-stone-800">
          {value}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-36 accent-stone-600 sm:w-52"
        />
      </div>
    </label>
  );
}

function Tray({
  title,
  items,
  onDragStart,
  onPick,
  variant,
}: {
  title: string;
  items: Item[];
  onDragStart: (i: Item) => void;
  onPick: (i: Item, stoneSize?: number) => void;
  variant?: "sheet" | "default";
}) {
  const isStoneTray = items.length > 0 && items.every((it) => it.category === "stone");
  const inSheet = variant === "sheet";

  return (
    <aside className={inSheet ? "" : "self-start rounded-xl border border-stone-300 bg-white/80 p-3 shadow-sm backdrop-blur"}>
      <h2 className="mb-2 px-1 font-serif text-sm uppercase tracking-[0.18em] text-stone-600">
        {title}
      </h2>
      <div className={inSheet
        ? "flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
        : "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-2"}>

        {items.map((it) => (
          <div
            key={it.id}
            className={`group flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-gradient-to-b from-stone-50 to-stone-100 p-2 transition hover:border-stone-400 hover:from-white hover:shadow-md ${inSheet ? "w-24 shrink-0" : ""}`}
            title={`${it.name} — ${it.price} ₺`}
          >
            <div
              draggable
              onDragStart={() => onDragStart(it)}
              onClick={() => {
                if (!isStoneTray) onPick(it);
              }}
              className={`flex w-full flex-col items-center gap-0.5 ${isStoneTray ? "cursor-grab" : "cursor-pointer active:scale-95"}`}
            >
              <div className="flex h-12 w-12 items-center justify-center">{it.render(it.category === "stone" ? 36 : Math.max(20, Math.min(48, 36 * ((it.sizeMm ?? 30) / 30))))}</div>
              <div className="line-clamp-1 w-full text-center text-[10px] font-medium text-stone-700">
                {it.name}
              </div>
            </div>
            {isStoneTray && (
              <div
                className="flex w-full gap-1.5"
                style={{ touchAction: "manipulation" }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {(it.sizes && it.sizes.length ? it.sizes : [3, 6, 9]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onPick(it, size);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="flex-1 rounded border border-stone-300 bg-white py-1.5 text-[11px] font-medium text-stone-700 transition hover:border-stone-500 hover:bg-stone-100 active:bg-stone-200 sm:py-0.5 sm:text-[9px]"
                  >
                    {size}mm
                  </button>
                ))}
              </div>
            )}
            <div className="text-[9px] tabular-nums text-stone-500">{it.price} ₺</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
