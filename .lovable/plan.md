# Paperclip Chain — Gerçek Ataç Zincir Görünümüne Geçiş

## Mevcut sorun

Şu anki render çok ince + çok yoğun örtüşme yüzünden zincir "burulmuş ip" gibi görünüyor; bireysel halkalar okunmuyor. Referans fotoğrafta:

- Halkalar net görünen, içi boş, uzun dikdörtgen oval şeklinde
- Komşu halkalar **örtüşmüyor** — uçları birbirine değiyor (ataç mantığı)
- Stroke yeterince kalın ki halka oval okunabilsin
- Aspect ≈ 3:1 (uzun ve dar), düz altın ton, hafif highlight

## Çözüm — `src/components/PaperclipChain.tsx`

Halkayı daha okunaklı yap, örtüşmeyi kaldır, hollow oval şeklini öne çıkar.

**Geometri**:
- `linkLen` 1.56 → **2.6** (referansta halkalar belirgin; saç teli kalınlığında değil)
- Sembol viewport halka boyutu: width 20, height **5.4** (aspect ≈ 3.7:1). `rx/ry` = 2.7.
- `step = linkLen * 0.95` → halkalar **uç uca**, hafif bir görsel boşluk (referanstaki gibi).
- `n` hesabı aynı arc-length tabanlı; min 6, max 60.

**Stroke / kontrast**:
- `stroke = baseWidth * 1.4` — halka şekli okunsun. SVG viewBox biriminde ~0.63.
- Ana stroke: `stroke / linkScale` (sabit, ek toplama yok). Bu büyük halkalı non-scaling-stroke'la ortalama 1.0-1.2 px görüntüde çizgi.
- Gölge stroke: ana + 0.4 (görünür ama hafif), opaklık 0.22, offset y=0.5.
- İç highlight: çok hafif, opacity 0.25, kaldırabiliriz; referansta yok.

**Render sırası**:
- Çift-sonra-tek "interlock" mantığı **kaldırılıyor** (referansta halkalar üst üste değil yan yana). Tek geçişte sırayla çiziliyor.

**Renkler** (daha düz altın ton, soft highlight):
- Gold: `{ a: "#b07a25", b: "#e8c168", c: "#9c6a1f" }`
- Silver: `{ a: "#9aa0a6", b: "#dde1e5", c: "#8a9099" }`
- Gradient yönü: `x1=0 y1=0 x2=0 y2=1` (üstte hafif daha açık).

**Halka yön kararı**: referansta halkalar dik (uzun ekseni zincir yönünde). Mevcut kod zaten tangent açısıyla hizalıyor — değişmiyor.

## `src/routes/index.tsx`

Değişmez — slider varsayılanları doğru (90/9/92/52).

## Doğrulama

Playwright ile:
1. localStorage temizle, sayfa yükle, "Ataç" + "Altın" seç.
2. Ekran görüntüsü al, charm/chain bölgesini crop ile büyütüp referansa karşı görsel kontrol.
3. Halka sayısının ~30-45 aralığında olduğunu (use count) ve halkaların **bireysel** okunduğunu doğrula.
4. Gerekirse `linkLen` veya `step` değerini tek bir mikro-tur ile rafine et (örn. step 0.95 → 0.92).

## Riskler

- Halka büyütüldüğünde charm'ların altında "altta görünen" bir his oluşabilir — charm boyutu BASE değişmediği için zaten charm yeterince büyük; sorun olmaz.
- Mobil: 30-45 `<use>` → sorunsuz.
