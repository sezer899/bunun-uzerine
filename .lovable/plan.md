# Paperclip Chain (Ataç Zincir) Ekleme Planı

## Mevcut mimari (analiz)

**1. Zincir nasıl render ediliyor?**
- Teknoloji: **SVG** (Canvas/WebGL değil). `src/routes/index.tsx` satır 1219-1249'da, `viewBox="0 0 100 100"` koordinat sisteminde tek bir quadratic Bézier path (`M leftX,Y Q midX,dip rightX,Y`) çiziliyor.
- İki path üst üste: alt path gölge (siyah, hafif aşağıda), üst path `url(#chain)` linear gradient ile boyanıyor.
- Renk gradient stop'ları `chainStops` ile `chainColor` (`"silver" | "gold"`) durumuna göre seçiliyor (satır 540-543).
- Silver/Gold farkı tek çizgi + dashed stroke (`strokeDasharray="0.5 0.35"`) ile elde edilmiş.

**2. Charm'lar zincire nasıl yerleştiriliyor?**
- `Placed` tipinde `t` (0..1, Bézier üzerinde parametre) tutuluyor.
- `curvePoint(t, lx, rx, y, dip)` fonksiyonu (satır 242-247) aynı quadratic Bézier formülünü kullanarak charm/taş ekran konumunu hesaplıyor.
- Yani zincir görseli ile charm konumu **aynı eğri denklemini** paylaşıyor. Charm'lar absolute pozisyonlu DOM elementleri olarak SVG'nin üstünde render ediliyor (satır 1250-1251).

**3. State / persistence**
- `chainColor` state'i: `src/routes/index.tsx` (satır 301).
- Persist edilen yerler:
  - `src/lib/design-storage.ts` (tip: `"silver" | "gold"`)
  - `src/lib/saved-designs.functions.ts` (Zod: `z.enum(["silver","gold"])`)
  - `src/components/DesignThumbnail.tsx` (renk haritası)

## Önerilen yaklaşım

Mimariyi bozmamak için **eğri matematiğini değiştirmiyoruz**. Yalnızca zincirin görsel render katmanına bir varyant ekliyoruz; charm konumlandırma (`curvePoint`) ve `Placed.t` semantiği aynı kalıyor — bu da Gold/Silver tasarımlarının ve kayıtlı/draft tasarımların geriye dönük çalışmasını garanti eder.

### Teknik yaklaşım: SVG `<pattern>` + halka şablonu, eğri üzerinde dağıtım

İki yaygın seçenekten en performanslısı:

- **Seçenek A (önerilen): `<use>` ile halka kopyalama eğri boyunca.**
  Bir kez `<symbol id="paperclip-link">` (oval halka — iki concentric rounded rect, gradient stroke) tanımla. Component mount'ta veya `useMemo` ile, mevcut quadratic Bézier'i N parçaya böl (örn. arc-length ≈ `chainRightX - chainLeftX` ölçeğine bağlı, ~28-40 halka). Her halka için `t_i`'de `curvePoint` ile (x,y) ve teğet açısı hesaplanır, sonra `<use href="#paperclip-link" transform={`translate(x y) rotate(angle) scale(s)`} />` olarak çizilir. Komşu halkalar 90° dönüşümlü olur (gerçek paperclip görünümü).
  - Avantaj: tek SVG sembolü + N adet hafif `<use>` node → mobilde ucuz, GPU dostu.
  - Dezavantaj: Gerçek arc-length değil parametrik t kullandığımız için orta noktada hafif sıkışma olabilir; pratikte fark gözle görünmez çünkü dip aralığı küçük. İstenirse basit bir arc-length yaklaşımı (10 örnekleme + cumulative length) eklenir.

- Seçenek B: `<path>` üzerine `strokeDasharray` ile özel desen + paralel ikinci offset path. Daha ucuz ama gerçek halka görünümü zayıf.

→ **Seçenek A'yı uyguluyoruz.**

### Halka tasarımı

`<symbol id="paperclip-link" viewBox="-10 -4 20 8">` içinde:
- Dış oval: `<rect x="-9" y="-3" width="18" height="6" rx="3" />` stroke gradient, fill yok.
- İç highlight: ikinci ince stroke veya `<rect>` daha açık tonla, üst kenarda.
- Gradient `<linearGradient id="paperclip-gold/silver">` — mevcut `chainStops` mantığı yeniden kullanılır.

Halka boyutu zincirin `ropeWidth` ölçeğine ve SVG viewBox (0..100) birimine göre küçük tutulur (genişlik ≈ 2.2, yükseklik ≈ 0.9 viewBox birimi → mevcut çizginin yaklaşık 2× kalınlığı).

### Değişecek dosyalar

1. **`src/lib/design-storage.ts`** — `chainColor` tipini genişlet:
   `chainColor: "silver" | "gold" | "paperclip-gold" | "paperclip-silver"`
   (Veya daha temiz: ayrı `chainStyle: "rope" | "paperclip"` + `chainColor: "silver" | "gold"`. Aşağıda bunu öneriyoruz — geriye dönük uyumlu, draft hydration mevcut kayıtları "rope" varsayar.)

2. **`src/lib/saved-designs.functions.ts`** — Zod şemasına yeni opsiyonel alan:
   `chainStyle: z.enum(["rope","paperclip"]).optional().default("rope")`

3. **`src/routes/index.tsx`**
   - Yeni state: `const [chainStyle, setChainStyle] = useState<"rope"|"paperclip">("rope")`.
   - Draft hydration / save / `currentDesign` / `loadFromGallery` bloklarına `chainStyle` eklenir.
   - `canvasInner` içindeki SVG: mevcut iki `<path>` `chainStyle === "rope"` koşuluna alınır; `chainStyle === "paperclip"` ise yeni `<PaperclipChain leftX={...} rightX={...} y={...} dip={...} color={chainColor} />` bileşeni render edilir.
   - Yeni yardımcı (aynı dosyada veya `src/components/PaperclipChain.tsx`):
     - `useMemo` ile halka sayısını uzaklığa göre hesapla (örn. `Math.round((chainRightX - chainLeftX) * 0.45)` ~ 30 halka).
     - Her halka için t'de `curvePoint` + teğet açısı ( türev: `dx/dt = 2(1-t)(cx-lx) + 2t(rx-cx)`; `dy/dt = 2(1-t)(dip-y) + 2t(y-dip)` ; `angle = atan2(dy,dx)`).
     - Tek `<symbol>` + N `<use>` üretir.
   - UI: Zincir paneline üçüncü bir buton ekle ("Ataç"). Renk seçimi (altın/gümüş) aynı kalır — paperclip moda da uygulanır.

4. **`src/components/DesignThumbnail.tsx`** — thumbnail'de basit destek: `chainStyle === "paperclip"` ise stroke yerine `strokeDasharray` ile yaklaşık halka deseni (thumbnail küçük; tam halka rendering gereksiz). Tip güncellenir.

### Mobil performans notları

- ~30-40 `<use>` SVG node mobil için sorunsuz; React tarafında `useMemo` ile sadece slider değiştiğinde yeniden hesaplanır.
- Halka pozisyonları render anında hesaplanır, animasyon/RAF yok → reflow maliyeti minimum.
- `vectorEffect="non-scaling-stroke"` kullanılır; CSS transform yok.
- Pointer/charm event'leri SVG `pointer-events: none` olduğundan etkilenmez; charm yerleştirme aynı `curvePoint` üzerinden devam ettiği için davranış değişmez.

### Geriye dönük uyumluluk

- Eski draft / kayıtlı tasarımlarda `chainStyle` yoksa varsayılan `"rope"` → mevcut Gold/Silver görünüm aynen korunur.
- `Placed.t` semantiği değişmediği için tüm var olan kayıtlar paperclip'e geçildiğinde de doğru noktalarda durur.

## Riskler

- Halkaların eğri üzerinde eşit aralıklı görünmesi için (basit t-dağılımı yerine) küçük bir arc-length yaklaşımı gerekebilir; ilk sürümde gözle test edip gerekirse 10 örneklemeli cumulative-length adımı eklenir.
- Mobilde çok yüksek halka sayısı (>60) seçilirse FPS düşebilir → üst sınır 40.
