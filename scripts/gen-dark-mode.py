"""
產生夜晚模式的配色對照（src/app/dark-mode.css）。

狩獵管理的元件把顏色寫死在 class 裡（例如 bg-[#FFFFFF]、text-[#18181B]），
這支腳本掃過 src/components 與 hunting-mgmt 頁面，把用到的淺色 class 一一對應到深色，
只在 <html data-theme="dark" data-app="mgmt"> 時生效。

新增元件用了新的淺色色碼或新的變體（hover:、active:…）時，重跑一次：
    python scripts/gen-dark-mode.py
"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent  # 專案根目錄

# 夜晚配色（Apple 系的深灰階，層次：頁面 < 卡片 < 填色 < 線）
PAGE = "#111113"
SURFACE = "#1C1C1F"
SURFACE_2 = "#26262A"   # 卡片上的淺填色（原本的 #F4F4F5 這一階）
FILL = "#303035"        # 原本的 #E4E4E7 當底色
LINE = "#2E2E33"        # 分隔線、邊框
INK_BTN = "#3A3A40"     # 原本的深色按鈕 #18181B（白字）

BG = {
    "white": SURFACE, "#FFFFFF": SURFACE, "#FCFCFC": SURFACE_2, "#FFFAF2": SURFACE_2,
    "#FAFAFA": PAGE,
    "#F7F7F8": SURFACE_2, "#F4F4F5": SURFACE_2, "#F2F2F4": SURFACE_2, "#F0F0F2": SURFACE_2, "#EFEFF1": SURFACE_2,
    "#EEEEF0": SURFACE_2, "#E8E8EC": FILL, "#E4E4E7": FILL, "#EBEBED": FILL,
    "#18181B": INK_BTN, "#27272A": "#46464D",
    "#FDECEC": "#3A2023", "#FEF2F2": "#3A2023",
}
TEXT = {
    "#18181B": "#F2F2F4", "#27272A": "#E4E4E7", "#3F3F46": "#D4D4D8", "#52525B": "#C4C4CA",
    "#71717A": "#A1A1AA", "#8E8E93": "#9A9AA2", "#A1A1AA": "#86868E",
    "#C4C4C8": "#5E5E66", "#C7C7CC": "#5E5E66", "#D4D4D8": "#55555C", "#E4E4E7": "#4A4A50",
    "#B42318": "#FF8A80", "#d03b3b": "#FF8A80",
}
BORDER = {
    "#E4E4E7": LINE, "#EBEBED": LINE, "#F4F4F5": LINE, "#F2F2F4": LINE, "#EFEFF1": LINE, "#F0F0F2": LINE,
    "#D4D4D8": "#3E3E44", "#C7C7CC": "#46464D", "#A1A1AA": "#5E5E66", "#18181B": "#F2F2F4", "white": SURFACE,
}

def hex_rgba(h, a):
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{a})"

def esc(cls):
    return re.sub(r"([\[\]#/:.&>*+])", r"\\\1", cls)

VARIANTS = {
    "": "",
    "hover:": ":hover",
    "active:": ":active",
    "focus:": ":focus",
    "focus-visible:": ":focus-visible",
    "focus-within:": ":focus-within",
}

# 掃描實際用到的 class，只產生需要的規則
src = ""
for p in list((root / "src/components").rglob("*.tsx")) + [root / "src/app/hunting-mgmt/page.tsx"]:
    src += p.read_text(encoding="utf-8")
used = set(re.findall(r"(?:\[&>\*\+\*\]:)?[\w:-]*?(?:bg|text|border|divide|ring|decoration)-(?:\[#[0-9A-Fa-f]{6}\]|white|black)(?:/\d+)?", src))

SCOPE = 'html[data-theme="dark"][data-app="mgmt"]'
rules = []
for cls in sorted(used):
    m = re.match(r"^((?:\[&>\*\+\*\]:)?(?:[\w-]+:)*)(bg|text|border|divide|ring|decoration)-(\[#([0-9A-Fa-f]{6})\]|white|black)(?:/(\d+))?$", cls)
    if not m:
        continue
    variant, kind, raw, hx, alpha = m.groups()
    key = f"#{hx.upper()}" if hx else raw
    if key == "#D03B3B":
        key = "#d03b3b"
    table = {"bg": BG, "text": TEXT, "border": BORDER, "divide": BORDER, "ring": BORDER, "decoration": TEXT}[kind]
    # 「白字」「黑」維持不變；只換表上有的
    if key not in table:
        continue
    # 半透明白（≤30%）是深色底上的亮光效果，夜晚照用
    if key == "white" and alpha and int(alpha) <= 30:
        continue
    color = table[key]
    if alpha:
        color = hex_rgba(color, int(alpha) / 100)
    # 變體
    pseudo = ""
    prefix_sel = ""
    if variant:
        if variant == "[&>*+*]:":
            pseudo = " > * + *"
        elif variant == "group-active:":
            prefix_sel = ".group:active "
        elif variant == "placeholder:":
            pseudo = "::placeholder"
        elif variant in VARIANTS:
            pseudo = VARIANTS[variant]
        else:
            continue
    sel = f"{SCOPE} {prefix_sel}.{esc(cls)}{pseudo}"
    prop = {"bg": "background-color", "text": "color", "border": "border-color", "decoration": "text-decoration-color"}.get(kind)
    if kind == "divide":
        rules.append(f"{SCOPE} .{esc(cls)} > :not(:last-child) {{ border-color: {color}; }}")
        continue
    if kind == "ring":
        rules.append(f"{sel} {{ --tw-ring-color: {color}; }}")
        continue
    rules.append(f"{sel} {{ {prop}: {color}; }}")

css = f"""/* ══════════════════════════════════════════════════════════
   夜晚模式（頭像 → 設定 → 外觀）
   狩獵管理的元件用的是寫死的淺色色碼（例如 bg-[#FFFFFF]、text-[#18181B]），
   這裡在 <html data-theme="dark" data-app="mgmt"> 時把每個淺色換成對應的深色。
   只作用在狩獵管理；狩獵覺醒等本來就是深色的頁面不受影響。
   由 scripts/gen-dark-mode.py 產生的對照：頁面 {PAGE}、卡片 {SURFACE}、淺填色 {SURFACE_2}、線 {LINE}。
   新增元件時沿用既有色碼就會自動支援夜晚模式；用了新色碼請重跑腳本。
   ══════════════════════════════════════════════════════════ */

{SCOPE} {{
  color-scheme: dark;
  --accent-soft: color-mix(in srgb, var(--accent) 20%, {SURFACE});
  --accent-soft-2: color-mix(in srgb, var(--accent) 30%, {SURFACE});
  --accent-strong: color-mix(in srgb, var(--accent) 85%, white);
  --accent-ink: color-mix(in srgb, var(--accent) 55%, white);
  --ink: #F2F2F4;
  --ink-2: #D4D4D8;
  --muted: #86868E;
  --text-3: #A1A1AA;
  --line: {LINE};
  --track: {SURFACE_2};
}}
{SCOPE} body {{ background: {PAGE}; }}

/* 卡片陰影：深色底上改成細亮邊＋較深的投影 */
{SCOPE} .shadow-card {{ box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 6px 20px rgba(0,0,0,0.35); }}

/* 專案情報的深色總覽卡：夜晚時比一般卡片再亮一階，才分得出主角 */
{SCOPE} .bg-\[\#1C1C1F\] {{ background-color: #2A2A30; }}

/* 表單元件 */
{SCOPE} input, {SCOPE} textarea, {SCOPE} select {{ color-scheme: dark; }}

""" + "\n".join(rules) + "\n"
(root / "src/app/dark-mode.css").write_text(css, encoding="utf-8")
print(len(rules), "rules")
