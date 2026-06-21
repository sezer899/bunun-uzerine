import { createFileRoute } from "@tanstack/react-router";
import { createHmac, randomBytes } from "crypto";

function getIyzicoBase() {
  return (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").replace(/\/$/, "");
}
const RETRIEVE_URI = "/payment/iyzipos/checkoutform/auth/ecom/detail";

function buildAuthHeader(apiKey: string, secretKey: string, randomKey: string, body: string) {
  const payload = randomKey + RETRIEVE_URI + body;
  const signature = createHmac("sha256", secretKey).update(payload).digest("hex");
  const authString = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return "IYZWSv2 " + Buffer.from(authString, "utf8").toString("base64");
}

async function retrievePayment(token: string) {
  const apiKey = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  if (!apiKey || !secretKey) return { error: "iyzico anahtarları yapılandırılmamış" };

  const bodyObj = {
    locale: "tr",
    conversationId: `retrieve-${Date.now()}`,
    token,
  };
  const body = JSON.stringify(bodyObj);
  const randomKey = `${Date.now()}-${randomBytes(8).toString("hex")}`;
  const auth = buildAuthHeader(apiKey, secretKey, randomKey, body);

  try {
    const res = await fetch(getIyzicoBase() + RETRIEVE_URI, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-iyzi-rnd": randomKey,
        Authorization: auth,
      },
      body,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: "iyzico geçersiz yanıt", raw: text };
    }
  } catch (e) {
    console.error("iyzico retrieve error", e);
    return { error: "iyzico isteği başarısız" };
  }
}

function renderPage(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#f5f5f4;color:#1c1917;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:white;border:1px solid #e7e5e4;border-radius:16px;padding:32px;max-width:520px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.06)}
h1{margin:0 0 12px;font-size:22px}p{margin:8px 0;color:#57534e}code{background:#f5f5f4;padding:2px 6px;border-radius:4px;font-size:12px}
a{display:inline-block;margin-top:20px;background:#1c1917;color:white;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px}</style>
</head><body><div class="card">${body}<a href="/">Tasarıma dön</a></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handle(request: Request) {
  let token: string | null = null;
  if (request.method === "POST") {
    try {
      const form = await request.formData();
      token = String(form.get("token") ?? "") || null;
    } catch {
      // ignore
    }
  }
  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get("token");
  }

  if (!token) {
    return renderPage(
      "Ödeme Sonucu",
      `<h1>Ödeme tamamlanmadı</h1><p>Token bulunamadı.</p>`,
    );
  }

  const result = await retrievePayment(token);
  const status = String((result as any).paymentStatus || (result as any).status || "");
  const ok = status === "SUCCESS" || (status === "success" && (result as any).paymentStatus === "SUCCESS");
  const success = (result as any).paymentStatus === "SUCCESS";

  if (success) {
    const price = (result as any).paidPrice ?? (result as any).price;
    const conversationId = (result as any).conversationId;
    const paymentId = (result as any).paymentId;
    return renderPage(
      "Ödeme Başarılı",
      `<h1>Ödeme Başarılı 🎉</h1>
       <p>Ödemeniz başarıyla alındı.</p>
       ${price ? `<p>Tutar: <strong>${price} TRY</strong></p>` : ""}
       ${paymentId ? `<p>Ödeme No: <code>${paymentId}</code></p>` : ""}
       ${conversationId ? `<p>Sipariş No: <code>${conversationId}</code></p>` : ""}
       <script>
         try {
           var k = "bk:usedPublicDesignId";
           var id = localStorage.getItem(k);
           if (id) {
             fetch("/api/public/increment-design-orders", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ id: id }),
               keepalive: true,
             }).finally(function () { localStorage.removeItem(k); });
           }
         } catch (e) { /* ignore */ }
       </script>`,
    );
  }

  const errMsg = (result as any).errorMessage || (result as any).error || status || "bilinmiyor";
  console.error("iyzico retrieve non-success", result);
  return renderPage(
    "Ödeme Sonucu",
    `<h1>Ödeme tamamlanmadı</h1>
     <p>Durum: <code>${status || "bilinmiyor"}</code></p>
     <p>${errMsg}</p>
     <p>Token: <code>${token}</code></p>`,
  );
}

export const Route = createFileRoute("/odeme/sonuc")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
