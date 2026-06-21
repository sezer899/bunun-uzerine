# Paperclip Chain İnceltme + Klasik Zincir Öntanımlı Değerler

## 1. `src/components/PaperclipChain.tsx` — narin/dainty stil

Mevcut `linkLen = 2.6` ve sembol viewport'u `20×6`. İstenen değişiklikler somut sayılara çevrilince:

- **Halka boyutu %40 küçük**: `linkLen` 2.6 → **1.56**. Bu halka sayısını otomatik olarak ~1.66× artırır (arc-length tabanlı dağıtım), yani daha çok ve daha küçük halka.
- **Yükseklik daha az** (uzunluk korunur, oval daha ince): sembol `rect` boyutu `20×6` → `20×3.6` (yükseklik %40 azaldı). `rx/ry` 3 → 1.8. `linkScale` hesabı `linkLen/20` zaten uzunluğu sürer; sadece `scale(linkScale, linkScale)` yerine yükseklikte ek çarpan **kaldırılıyor** (alt halkalar için `0.55` çarpanı vardı — kaldır). Tüm halkalar aynı ince oval olur.
- **Stroke kalınlığı %50 azalt**: ana stroke `stroke / linkScale + 0.05` → yarıya. Yeni hesap: `(stroke * 0.5) / linkScale + 0.02`. Gölge stroke `+ 0.35` → `+ 0.15`. Highlight stroke 0.5 → 0.25.
- **Komşu halkalar daha sıkı**: `step = linkLen * 0.72` → `linkLen * 0.55`. Halkalar uçlarından belirgin örtüşür → "fiziksel olarak geçmiş" hissi.
- **Bevel/3D efekti hafifle**:
  - Gradient yönü `x1=0 y1=0 x2=0 y2=1` (sert dikey bevel) → `x1=0 y1=0 x2=1 y2=0.4` (yumuşak yatay highlight).
  - Renk stop'ları daha sade: gold `{ a: "#a07626", b: "#f4e0a3", c: "#b8852a" }`, silver `{ a: "#9aa0a6", b: "#eef0f2", c: "#a3a8af" }`. Tek ton bandı; aşırı parlama yok.
  - İç highlight opaklığı 0.55 → 0.35.
  - Gölge alpha 0.28 → 0.18; offset `translate(0,0.7)` → `translate(0,0.3)`.
- **Alt-halka 90° dönüş özelliği** (`alt: i % 2 === 1` ve `* 0.55` y-ölçeği) **kaldırılır** — gerçek paperclip zincirlerinde halkalar aynı yönde sıralanır.
- **Üst sınır**: `n` max 48 → 80 (daha küçük halka × daha kalabalık zincir). Min: 10. Mobil performans için yeterli (`<use>` ucuz).

Yeni `links` üretimi aynı arc-length örnekleme mantığını korur (`SAMPLES=40`); sadece `linkLen` ve `step` değişir. Charm yerleşimini etkilemez — bu hâlâ yalnızca görsel katmandır.

## 2. `src/routes/index.tsx` — klasik zincir öntanımlı slider değerleri

Mevcut başlangıç state'leri:

```ts
const [chainDip, setChainDip] = useState(90);     // ✓ zaten 90
const [chainLeftX, setChainLeftX] = useState(9);  // ✓ zaten 9
const [chainRightX, setChainRightX] = useState(91); // → 92
const [chainY, setChainY] = useState(45);         // → 52
```

Sadece iki sayı değişir: `chainRightX` 91→**92**, `chainY` 45→**52**.

Not: Bu değerler ilk mount için varsayılan; mevcut localStorage taslağı varsa override edilir (draft hydration). Yeni kullanıcı / taslak yokken istenen 90/9/92/52 değerleri uygulanır.  
  
Paperclip Chain iyileştirmelerine ek olarak:

Bağlantı hissini artır.

Şu an halkalar yan yana dizilmiş görünüyor.

İstediğim görünüm:

- Her halka bir sonraki halkanın içinden geçmiş gibi görünmeli.
- Komşu halkalar yaklaşık %25-35 oranında üst üste binsin.
- Zincir tek bir bütün gibi algılansın.
- Ayrık zincir halkaları görüntüsünden kaçınılsın.

Render sırası:

- Çift indeksli halkalar önce çizilsin.
- Tek indeksli halkalar sonra çizilsin.

Böylece halkaların birbirinin içinden geçtiği hissi oluşsun.

Alternatif olarak:

Komşu halkaların kesişim bölgesinde küçük bir maskeleme (SVG mask/clipPath) kullanılarak gerçek bağlantı hissi oluşturulabilir.

Öncelik:

Takı fotoğrafındaki zarif ve bütünleşik zincir görünümü.  
Mekanik veya oyuncak zincir görünümünden kaçınılmalı.

## Değiştirilecek dosyalar

1. `src/components/PaperclipChain.tsx` — sembol geometrisi, gradient, stroke, step, `alt` mantığının kaldırılması.
2. `src/routes/index.tsx` — iki `useState` başlangıç değeri.

## Doğrulama

- Playwright ile preview'da:
  - Sayfa yüklenince zincir Y=52 / sağ=92 / sol=9 / dip=90 oturmuş mu.
  - "Ataç" moduna geçişte halka sayısı ≥ ~50, stroke ince, yatay highlight yumuşak.
  - Altın varyant ekran görüntüsü dainty referansla karşılaştır.