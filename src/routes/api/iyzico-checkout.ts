import { createFileRoute } from "@tanstack/react-router";
import { createHmac, randomBytes } from "crypto";

function getIyzicoBase() {
  return (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").replace(/\/$/, "");
}
const URI_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";

type BasketItemInput = {
  id: string;
  name: string;
  price: number;
};

type CheckoutBody = {
  total: number;
  items: BasketItemInput[];
};

function buildAuthHeader(apiKey: string, secretKey: string, randomKey: string, body: string) {
  const payload = randomKey + URI_PATH + body;
  const signature = createHmac("sha256", secretKey).update(payload).digest("hex");
  const authString = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return "IYZWSv2 " + Buffer.from(authString, "utf8").toString("base64");
}

export const Route = createFileRoute("/api/iyzico-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.IYZICO_API_KEY;
        const secretKey = process.env.IYZICO_SECRET_KEY;
        if (!apiKey || !secretKey) {
          return Response.json({ error: "iyzico anahtarları yapılandırılmamış" }, { status: 500 });
        }

        let input: CheckoutBody;
        try {
          input = (await request.json()) as CheckoutBody;
        } catch {
          return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
        }

        const total = Math.max(1, Math.round(Number(input.total) || 0));
        const items = Array.isArray(input.items) && input.items.length > 0
          ? input.items
          : [{ id: "default-item", name: "Kolye", price: total }];

        // iyzico requires sum(basketItems.price) === price. Distribute total across items.
        const sum = items.reduce((s, it) => s + (Number(it.price) || 0), 0) || total;
        const basketItems = items.map((it, idx) => {
          const share = sum > 0
            ? Math.round(((Number(it.price) || 0) / sum) * total * 100) / 100
            : total / items.length;
          return {
            id: String(it.id || `item-${idx}`),
            name: String(it.name || "Ürün"),
            category1: "Takı",
            itemType: "PHYSICAL",
            price: share.toFixed(2),
          };
        });

        // Fix rounding drift so basket sum === total exactly.
        const basketSum = basketItems.reduce((s, it) => s + Number(it.price), 0);
        const drift = +(total - basketSum).toFixed(2);
        if (drift !== 0 && basketItems.length > 0) {
          basketItems[0].price = (Number(basketItems[0].price) + drift).toFixed(2);
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const conversationId = `conv-${Date.now()}-${randomBytes(4).toString("hex")}`;

        const payload = {
          locale: "tr",
          conversationId,
          price: total.toFixed(2),
          paidPrice: total.toFixed(2),
          currency: "TRY",
          basketId: `basket-${Date.now()}`,
          paymentGroup: "PRODUCT",
          callbackUrl: `${origin}/odeme/sonuc`,
          enabledInstallments: [1, 2, 3, 6, 9],
          buyer: {
            id: "BY-" + randomBytes(4).toString("hex"),
            name: "Test",
            surname: "Kullanici",
            gsmNumber: "+905350000000",
            email: "test@example.com",
            identityNumber: "11111111111",
            lastLoginDate: "2024-01-01 12:00:00",
            registrationDate: "2024-01-01 12:00:00",
            registrationAddress: "Kadikoy Istanbul",
            ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "85.34.78.112",
            city: "Istanbul",
            country: "Turkey",
            zipCode: "34732",
          },
          shippingAddress: {
            contactName: "Test Kullanici",
            city: "Istanbul",
            country: "Turkey",
            address: "Kadikoy Istanbul",
            zipCode: "34732",
          },
          billingAddress: {
            contactName: "Test Kullanici",
            city: "Istanbul",
            country: "Turkey",
            address: "Kadikoy Istanbul",
            zipCode: "34732",
          },
          basketItems,
        };

        const body = JSON.stringify(payload);
        const randomKey = `${Date.now()}-${randomBytes(8).toString("hex")}`;
        const auth = buildAuthHeader(apiKey, secretKey, randomKey, body);

        let res: Response;
        try {
          res = await fetch(getIyzicoBase() + URI_PATH, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-iyzi-rnd": randomKey,
              Authorization: auth,
            },
            body,
          });
        } catch (e) {
          console.error("iyzico fetch error", e);
          return Response.json({ error: "iyzico isteği başarısız" }, { status: 502 });
        }

        const text = await res.text();
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(text);
        } catch {
          console.error("iyzico invalid response", text);
          return Response.json({ error: "iyzico geçersiz yanıt" }, { status: 502 });
        }

        if (json.status !== "success" || !json.paymentPageUrl) {
          console.error("iyzico failure", json);
          return Response.json(
            { error: json.errorMessage || "iyzico ödeme formu oluşturulamadı", detail: json },
            { status: 400 },
          );
        }

        return Response.json({
          paymentPageUrl: json.paymentPageUrl,
          token: json.token,
        });
      },
    },
  },
});
