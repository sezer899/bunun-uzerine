## iyzico Ödeme Entegrasyonu

iyzico için Lovable'ın hazır bir connector'ı yok, bu yüzden API kimlik bilgileriyle özel bir entegrasyon kuracağız. Backend (Lovable Cloud) gerekli.

### Akış

1. **Lovable Cloud'u etkinleştir** (zaten açık değilse) — server function'ları çalıştırmak için.
2. **Secret'ları ekle** (`add_secret` ile, kullanıcı güvenli form üzerinden girer):
   - `IYZICO_API_KEY`
   - `IYZICO_SECRET_KEY`
   - `IYZICO_BASE_URL` (sandbox: `https://sandbox-api.iyzipay.com`, prod: `https://api.iyzipay.com`)
3. **Checkout Form Initialize server function** (`src/lib/iyzico.functions.ts`):
   - Sepet/tutar bilgisini alır, iyzico'nun PKI imzasını üretir, `/payment/iyzipos/checkoutform/initialize/auth/ecom` endpoint'ine POST atar.
   - Dönen `paymentPageUrl` veya `checkoutFormContent` (script) frontend'e döner.
4. **Callback route** (`src/routes/api/public/iyzico-callback.ts`):
   - iyzico ödeme sonrası kullanıcıyı buraya yönlendirir; `token` ile `/payment/iyzipos/checkoutform/auth/ecom/detail` çağrılır, sonuç doğrulanır ve siparişi DB'de "ödendi" olarak işaretler.
   - `/api/public/*` altında çünkü iyzico dışarıdan çağırır; içerde HMAC/imza doğrulaması yapılır.
5. **Frontend ödeme butonu**: Mevcut sepet/sipariş ekranına bir "iyzico ile Öde" butonu — `useServerFn(initializeIyzicoCheckout)` ile çağırır, dönen URL'ye yönlendirir veya inline form'u render eder.
6. **Sipariş tablosu** (henüz yoksa): `orders` tablosu (`id`, `user_id`, `amount`, `currency`, `status`, `iyzico_token`, `iyzico_payment_id`, `created_at`) + RLS politikaları + GRANT'lar.

### Açıklığa kavuşturulması gereken noktalar

Devam etmeden önce şunları netleştirmem gerekiyor:

1. **Sandbox mı yoksa canlı (production) iyzico hesabı mı** kullanacaksın? (Önerim: önce sandbox ile test, sonra prod.)
2. **Ne satılıyor?** Tek seferlik kolye/takı satışı mı, yoksa abonelik de var mı? (Şu an proje takı tasarım aracı — varsayım: tek seferlik sepet ödemesi.)
3. **Sipariş kaydı için DB tablosu** kurulsun mu, yoksa sadece ödeme alıp e-postayla mı bildirim istiyorsun?
4. **Para birimi**: TRY varsayıyorum, doğru mu?

Cevapların geldikten sonra planı netleştirip uygulamaya geçerim.