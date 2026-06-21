// Yerel (localStorage) tasarım saklayıcı.
// Hem otomatik devam taslağı hem de manuel kaydedilmiş tasarımlar burada tutulur.

export type DesignState = {
  placed: unknown[];
  chainDip: number;
  chainLeftX: number;
  chainRightX: number;
  chainY: number;
  chainColor: "silver" | "gold";
  chainStyle?: "rope" | "paperclip";
  lightEnabled?: boolean;
  lightIntensity?: number;
};

export type LocalDesign = {
  id: string;
  name: string;
  design: DesignState;
  createdAt: string;
  updatedAt: string;
};

const DRAFT_KEY = "bk:design:draft:v1";
const LIST_KEY = "bk:designs:v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadDraft(): DesignState | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DesignState;
  } catch {
    return null;
  }
}

export function saveDraft(state: DesignState) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    /* quota — yoksay */
  }
}

export function clearDraft() {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* yoksay */
  }
}

export function listLocalDesigns(): LocalDesign[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LocalDesign[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeList(items: LocalDesign[]) {
  if (!isBrowser()) return;
  localStorage.setItem(LIST_KEY, JSON.stringify(items));
}

export const MAX_SAVED_DESIGNS = 30;

export function saveLocalDesign(name: string, design: DesignState): LocalDesign {
  const list = listLocalDesigns();
  if (list.length >= MAX_SAVED_DESIGNS) {
    throw new Error(
      `En fazla ${MAX_SAVED_DESIGNS} tasarım kaydedebilirsiniz. Yenisini eklemek için diğerlerinden bazılarını silin.`,
    );
  }
  const now = new Date().toISOString();
  const item: LocalDesign = {
    id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "İsimsiz tasarım",
    design,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(item);
  writeList(list);
  return item;
}

export function deleteLocalDesign(id: string) {
  writeList(listLocalDesigns().filter((d) => d.id !== id));
}

export function clearLocalDesigns() {
  if (!isBrowser()) return;
  localStorage.removeItem(LIST_KEY);
}
