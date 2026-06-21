import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as htmlToImage from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { DesignThumbnail } from "@/components/DesignThumbnail";
import {
  listLocalDesigns,
  deleteLocalDesign,
  saveLocalDesign,
  clearLocalDesigns,
  type DesignState,
  type LocalDesign,
} from "@/lib/design-storage";
import {
  listMyDesigns,
  saveMyDesign,
  deleteMyDesign,
  setDesignVisibility,
  listPublicDesigns,
  migrateLocalDesigns,
} from "@/lib/saved-designs.functions";

type CloudDesign = {
  id: string;
  name: string;
  design: DesignState;
  preview_image: string | null;
  is_public: boolean;
  order_count: number;
  author_label: string | null;
  created_at: string;
  updated_at: string;
};

type PublicDesign = {
  id: string;
  name: string;
  design: DesignState;
  preview_image: string | null;
  author_label: string | null;
  order_count: number;
  updated_at: string;
};

type Props = {
  open: boolean;
  currentDesign: DesignState;
  hasContent: boolean;
  onClose: () => void;
  onLoad: (design: DesignState) => void;
};

type Tab = "mine" | "public";

export function SavedDesignsDialog({ open, currentDesign, hasContent, onClose, onLoad }: Props) {
  const [tab, setTab] = useState<Tab>("mine");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudDesign[]>([]);
  const [local, setLocal] = useState<LocalDesign[]>([]);
  const [publicList, setPublicList] = useState<PublicDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savePublic, setSavePublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const list = useServerFn(listMyDesigns);
  const saveCloud = useServerFn(saveMyDesign);
  const delCloud = useServerFn(deleteMyDesign);
  const setVisibility = useServerFn(setDesignVisibility);
  const fetchPublic = useServerFn(listPublicDesigns);
  const migrate = useServerFn(migrateLocalDesigns);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setLoading(true);

    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;
      if (cancelled) return;
      setUserEmail(email);
      setLocal(listLocalDesigns());

      if (data.user) {
        const localItems = listLocalDesigns();
        if (localItems.length > 0) {
          try {
            await migrate({
              data: { items: localItems.map((it) => ({ name: it.name, design: it.design })) },
            });
            clearLocalDesigns();
            if (!cancelled) setLocal([]);
          } catch (e) {
            console.warn("migrate failed", e);
          }
        }
        try {
          const rows = (await list()) as unknown as CloudDesign[];
          if (!cancelled) setCloud(rows);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi");
        }
      } else {
        setCloud([]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, list, migrate]);

  // Herkese açık sekmesi açıldığında yükle
  useEffect(() => {
    if (!open || tab !== "public") return;
    let cancelled = false;
    setLoadingPublic(true);
    (async () => {
      try {
        const rows = (await fetchPublic({ data: { limit: 50 } })) as unknown as PublicDesign[];
        if (!cancelled) setPublicList(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi");
      } finally {
        if (!cancelled) setLoadingPublic(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, fetchPublic]);

  if (!open) return null;

  async function capturePreview(): Promise<string | undefined> {
    if (typeof document === "undefined") return undefined;
    const el = document.getElementById("bk-canvas-capture") as HTMLElement | null;
    if (!el) return undefined;
    try {
      // Geçici olarak zoom transformunu sıfırla ki yakalama tam görüntüyü alsın.
      const prevTransform = el.style.transform;
      el.style.transform = "none";
      const rect = el.getBoundingClientRect();
      const scale = Math.min(1, 480 / Math.max(rect.width, 1));
      const dataUrl = await htmlToImage.toJpeg(el, {
        quality: 0.82,
        pixelRatio: scale,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      el.style.transform = prevTransform;
      // 180 KB üst sınır
      if (dataUrl.length > 180_000) return undefined;
      return dataUrl;
    } catch (e) {
      console.warn("preview capture failed", e);
      return undefined;
    }
  }

  async function handleSave() {
    if (!hasContent) {
      setError("Kaydedilecek bir tasarım yok. Önce takıya en az bir parça ekleyin.");
      return;
    }
    const name = saveName.trim() || `Tasarım ${new Date().toLocaleString("tr-TR")}`;
    setSaving(true);
    setError(null);
    try {
      const preview = await capturePreview();
      if (userEmail) {
        const row = (await saveCloud({
          data: { name, design: currentDesign, isPublic: savePublic, preview },
        })) as unknown as CloudDesign;
        setCloud((prev) => [row, ...prev]);
      } else {
        if (savePublic) {
          setError("Herkese açık paylaşım için önce giriş yapın.");
          setSaving(false);
          return;
        }
        const item = saveLocalDesign(name, currentDesign);
        setLocal((prev) => [item, ...prev]);
      }
      setSaveName("");
      setSavePublic(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, source: "cloud" | "local", name: string) {
    if (!confirm(`"${name}" silinsin mi?`)) return;
    try {
      if (source === "cloud") {
        await delCloud({ data: { id } });
        setCloud((prev) => prev.filter((c) => c.id !== id));
      } else {
        deleteLocalDesign(id);
        setLocal((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  }

  async function handleToggleVisibility(item: CloudDesign) {
    try {
      const next = !item.is_public;
      await setVisibility({ data: { id: item.id, isPublic: next } });
      setCloud((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, is_public: next } : c)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Güncellenemedi");
    }
  }

  function handleUsePublic(item: PublicDesign) {
    try {
      localStorage.setItem("bk:usedPublicDesignId", item.id);
    } catch {
      /* ignore */
    }
    onLoad(item.design);
    onClose();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUserEmail(null);
    setCloud([]);
    setLocal(listLocalDesigns());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="font-serif text-xl tracking-tight">Tasarımlar</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {userEmail
                ? `${userEmail} — bulutta saklanıyor`
                : "Şu an yalnızca bu tarayıcıda saklanıyor"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
            aria-label="Kapat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Sekmeler */}
        <div className="flex border-b border-stone-200 bg-stone-50">
          <button
            onClick={() => setTab("mine")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
              tab === "mine"
                ? "border-b-2 border-stone-900 text-stone-900"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Tasarımlarım
          </button>
          <button
            onClick={() => setTab("public")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
              tab === "public"
                ? "border-b-2 border-stone-900 text-stone-900"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Herkese Açık
          </button>
        </div>

        {tab === "mine" && !userEmail && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            Tasarımlarınızın cihaz/tarayıcı değişince de erişilebilir olması için{" "}
            <Link to="/auth" className="font-medium underline">
              giriş yapın
            </Link>
            . Mevcut yerel kayıtlarınız giriş yaptığınızda otomatik olarak buluta taşınır.
          </div>
        )}

        {tab === "mine" && (
          <div className="border-b border-stone-200 px-5 py-4">
            <label className="block text-xs text-stone-600">Mevcut tasarımı kaydet</label>
            <div className="mt-2 flex gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Örn. Annem için bileklik"
                className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                maxLength={120}
              />
              <button
                onClick={handleSave}
                disabled={saving || !hasContent}
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
            {userEmail && (
              <label className="mt-2 flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={savePublic}
                  onChange={(e) => setSavePublic(e.target.checked)}
                  className="h-3.5 w-3.5 accent-stone-900"
                />
                Herkese açık olarak paylaş (galeride görünür)
              </label>
            )}
            {!hasContent && (
              <p className="mt-1 text-[11px] text-stone-500">
                Önce takıya en az bir parça ekleyin.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "mine" ? (
            loading ? (
              <div className="py-10 text-center text-sm text-stone-500">Yükleniyor…</div>
            ) : cloud.length + local.length === 0 ? (
              <div className="py-10 text-center text-sm text-stone-500">
                Henüz kayıtlı tasarımınız yok.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cloud.map((it) => (
                  <li
                    key={`cloud_${it.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-stone-200 p-2.5"
                  >
                    <DesignThumbnail
                      design={it.design}
                      preview={it.preview_image}
                      size={180}
                      className="w-full h-auto aspect-square"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">{it.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-stone-500">
                        <span>{new Date(it.updated_at).toLocaleDateString("tr-TR")}</span>
                        {it.is_public && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium uppercase tracking-wider text-emerald-700">
                            açık · 🛒 {it.order_count}
                          </span>
                        )}
                      </div>
                      <label className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-700">
                        <input
                          type="checkbox"
                          checked={it.is_public}
                          onChange={() => handleToggleVisibility(it)}
                          className="h-3 w-3 accent-stone-900"
                        />
                        Herkese açık
                      </label>
                    </div>
                    <div className="mt-auto flex gap-1.5">
                      <button
                        onClick={() => {
                          onLoad(it.design);
                          onClose();
                        }}
                        className="flex-1 rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Aç
                      </button>
                      <button
                        onClick={() => handleDelete(it.id, "cloud", it.name)}
                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </li>
                ))}
                {local.map((it) => (
                  <li
                    key={`local_${it.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-stone-200 p-2.5"
                  >
                    <DesignThumbnail
                      design={it.design}
                      size={180}
                      className="w-full h-auto aspect-square"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">{it.name}</div>
                      <div className="text-[10px] text-stone-500">
                        {new Date(it.updatedAt).toLocaleDateString("tr-TR")}
                        <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 uppercase tracking-wider text-stone-600">
                          Bu cihaz
                        </span>
                      </div>
                    </div>
                    <div className="mt-auto flex gap-1.5">
                      <button
                        onClick={() => {
                          onLoad(it.design);
                          onClose();
                        }}
                        className="flex-1 rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Aç
                      </button>
                      <button
                        onClick={() => handleDelete(it.id, "local", it.name)}
                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : loadingPublic ? (
            <div className="py-10 text-center text-sm text-stone-500">Yükleniyor…</div>
          ) : publicList.length === 0 ? (
            <div className="py-10 text-center text-sm text-stone-500">
              Henüz paylaşılmış bir tasarım yok. İlki sen ol!
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {publicList.map((it, idx) => (
                <li
                  key={it.id}
                  className="relative flex flex-col gap-2 rounded-lg border border-stone-200 p-2.5"
                >
                  <div className="absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-[10px] font-semibold text-white shadow">
                    {idx + 1}
                  </div>
                  <DesignThumbnail
                    design={it.design}
                    preview={it.preview_image}
                    size={180}
                    className="w-full h-auto aspect-square"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-900">{it.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-stone-500">
                      <span>@{it.author_label ?? "anonim"}</span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium uppercase tracking-wider text-amber-800">
                        🛒 {it.order_count}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUsePublic(it)}
                    className="mt-auto rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
                  >
                    Bu tasarımı kullan
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-stone-200 px-5 py-3 text-right">
          {userEmail ? (
            <button onClick={handleSignOut} className="text-xs text-stone-600 hover:underline">
              Çıkış yap
            </button>
          ) : (
            <Link to="/auth" className="text-xs font-medium text-stone-900 hover:underline">
              Giriş yap / Kayıt ol →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
