## Goal
Update defaults, relabel chain controls, and lock out stones when the paperclip (zincir) style is selected.

## Changes (single file: `src/routes/index.tsx`)

### 1) Default values
- `chainDip` initial `90` → `88`
- `chainRightX` initial `92` → `91`
- `chainY` initial `52` (unchanged, already 52)
- `chainLeftX` initial `9` (unchanged)
- `lightIntensity` initial `1` → `0.65`

(`loadDraft` rehydration logic stays the same so saved drafts keep their own values.)

### 2) Relabeling
- Row label currently rendering `"Zincir"` (above color buttons, ~line 1642) → `"Renk"`.
- Chain type buttons (~line 1681): `"Klasik"` → `"Misina"`, `"Ataç"` → `"Zincir"`.

### 3) Paperclip ("Zincir") info bubble
Add an effect that, when `chainStyle === "paperclip"` becomes active and the user hasn't seen the tip yet, shows the existing `infoBubble` with text:
> "Zincire sadece charm ve takı parçaları eklenebilir."

Uses the existing `seenTips` key (e.g. `paperclipInfo`) so it appears once per session.

### 4) Lock stones when paperclip is selected
When `chainStyle === "paperclip"`:
- **Visual:** Render the stones Tray (desktop left tray, mobile "Taşlar" tab button, and tray sheet content) with reduced opacity + `pointer-events` blocked overlay (or a wrapper that intercepts pointer events).
- **Behavior:** Clicking the muted Taşlar tab/tile/size button or attempting drag triggers a warning toast / `infoBubble`:
  > "Taş eklemek için zincir tipini Misina olarak değiştirmelisiniz."
- **Hard guard in `addToChain`:** if `item.category === "stone"` and `chainStyle === "paperclip"`, ignore and surface the same warning instead of placing.

Implementation approach:
- Add a derived `stonesLocked = chainStyle === "paperclip"`.
- Pass `disabledReason?: string` and `onDisabledAttempt?: () => void` props to `Tray`; when set, the tray renders with `opacity-60`, the inner click/drag handlers call `onDisabledAttempt` instead of `onPick`/`onDragStart`. Cards get `cursor-not-allowed`, draggable disabled.
- Same gating in the mobile sticky `Taşlar` tab button: when locked, clicking it shows the warning instead of opening the sheet.
- `addToChain` early-return + warning fallback for stones when locked.

## Out of scope
- No changes to `PaperclipChain.tsx`, storage shape, or saved-design types.
- Charm and part flows untouched.
