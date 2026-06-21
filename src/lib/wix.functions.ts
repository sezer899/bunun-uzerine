import { createServerFn } from "@tanstack/react-start";

export type StoneDTO = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  sizes: number[];
};

export type CharmDTO = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  size: number;
};

export type PartDTO = CharmDTO;

const GATEWAY_URL = "https://connector-gateway.lovable.dev/wix";

let cachedSiteId: string | null = null;

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const wixKey = process.env.WIX_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!wixKey) throw new Error("WIX_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": wixKey,
    "Content-Type": "application/json",
  };
}

async function getSiteId(): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  if (process.env.WIX_SITE_ID) {
    cachedSiteId = process.env.WIX_SITE_ID;
    return cachedSiteId;
  }
  const res = await fetch(`${GATEWAY_URL}/site-list/v2/sites/query`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query: { cursorPaging: { limit: 1 } } }),
  });
  if (!res.ok) {
    throw new Error(`Wix site query failed [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as { sites?: Array<{ id: string }> };
  const id = data.sites?.[0]?.id;
  if (!id) throw new Error("No Wix sites available on this account");
  cachedSiteId = id;
  return id;
}

function wixImageToUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  if (raw.startsWith("http")) return raw;
  const m = raw.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (m) return `https://static.wixstatic.com/media/${m[1]}`;
  return "";
}

function normalizeSizes(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""))))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map((s) => Number(s.replace(/[^\d.]/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof raw === "number") return [raw];
  return [];
}

async function queryCollection(
  dataCollectionId: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const siteId = await getSiteId();
  const res = await fetch(`${GATEWAY_URL}/wix-data/v2/items/query`, {
    method: "POST",
    headers: { ...authHeaders(), "wix-site-id": siteId },
    body: JSON.stringify({
      dataCollectionId,
      query: { filter: { aktif: true }, paging: { limit: 100 } },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Wix data query failed for ${dataCollectionId} [${res.status}]: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    dataItems?: Array<{ id: string; data: Record<string, unknown> }>;
  };
  return json.dataItems ?? [];
}

export const getStones = createServerFn({ method: "GET" }).handler(async (): Promise<StoneDTO[]> => {
  const items = await queryCollection("Taslar");
  return items
    .map((it): StoneDTO | null => {
      const d = it.data ?? {};
      const name = typeof d.ad === "string" ? d.ad : "";
      if (!name) return null;
      const sizes = normalizeSizes(d.boyut);
      return {
        id: it.id,
        name,
        imageUrl: wixImageToUrl(d.gorsel),
        price: typeof d.fiyat === "number" ? d.fiyat : Number(d.fiyat) || 0,
        sizes: sizes.length ? sizes : [3, 6, 9],
      };
    })
    .filter((x): x is StoneDTO => x !== null);
});

function mapSimple(items: Array<{ id: string; data: Record<string, unknown> }>): CharmDTO[] {
  return items
    .map((it): CharmDTO | null => {
      const d = it.data ?? {};
      const name = typeof d.ad === "string" ? d.ad : "";
      if (!name) return null;
      const sizes = normalizeSizes(d.boyut);
      return {
        id: it.id,
        name,
        imageUrl: wixImageToUrl(d.gorsel),
        price: typeof d.fiyat === "number" ? d.fiyat : Number(d.fiyat) || 0,
        size: sizes[0] ?? 30,
      };
    })
    .filter((x): x is CharmDTO => x !== null);
}

export const getCharms = createServerFn({ method: "GET" }).handler(async (): Promise<CharmDTO[]> => {
  return mapSimple(await queryCollection("Charmlar"));
});

export const getParts = createServerFn({ method: "GET" }).handler(async (): Promise<PartDTO[]> => {
  return mapSimple(await queryCollection("TakiParcalari"));
});
