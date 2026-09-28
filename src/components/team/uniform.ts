/* ══════════════════════════════════════════════════════════
   公司制服（向量）：卡牌人像與「還沒上傳照片」的剪影共用同一套外型
   座標以「臉寬 fw」為單位，所以任何大小的卡牌都能套用。
   外型：深灰連帽上衣，帽子在頸後、肩線寬到超出卡牌兩側，左胸有品牌 logo。
   要換成真正的公司制服顏色，只要改 UNIFORM 這幾個值。
   ══════════════════════════════════════════════════════════ */

export const UNIFORM = {
  top: "#2C2C31",
  bottom: "#141416",
  hoodColor: "#1B1B1F",
  hoodInner: "#0D0D0F",
  trim: "#101012",
  string: "#D8D8DC",
  logo: "/Logo｜Orange.svg",
  /** 頸後的帽子（目前關掉：人像邊緣看起來像多了兩塊，改用帽繩表現連帽上衣） */
  hood: false as boolean,
};

export interface UniformGeo {
  /** 臉的水平中心 */
  cx: number;
  /** 領口（下巴下方）的高度 */
  collarY: number;
  /** 臉寬 */
  fw: number;
  /** 畫布高度（衣服畫到底） */
  H: number;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** 頸後的帽子（要畫在人像後面） */
export function hoodPath({ cx, collarY, fw }: UniformGeo): string {
  const y = collarY;
  return [
    `M ${f(cx - 1.02 * fw)} ${f(y + 0.42 * fw)}`,
    `C ${f(cx - 1.0 * fw)} ${f(y - 0.1 * fw)} ${f(cx - 0.62 * fw)} ${f(y - 0.34 * fw)} ${f(cx)} ${f(y - 0.34 * fw)}`,
    `C ${f(cx + 0.62 * fw)} ${f(y - 0.34 * fw)} ${f(cx + 1.0 * fw)} ${f(y - 0.1 * fw)} ${f(cx + 1.02 * fw)} ${f(y + 0.42 * fw)}`,
    "Z",
  ].join(" ");
}

/** 衣身（畫在人像前面，蓋住原本的衣服）：斜方肌 → 肩頭 → 兩側垂直出畫面，圓領 */
export function bodyPath({ cx, collarY, fw, H }: UniformGeo): string {
  const y = collarY;
  const n = 0.34 * fw; // 領口半寬
  // 斜方肌到肩頭的線要平緩（接近一條往外微微下斜的線），肩頭在卡牌外面，才不會像圓頂
  const T = { x: 1.5, y: 0.3 }; // 肩線中段
  const C = { x: 2.15, y: 0.95 }; // 肩頭（在畫面外）
  return [
    `M ${f(cx - n)} ${f(y)}`,
    `C ${f(cx - n - 0.3 * fw)} ${f(y + 0.03 * fw)} ${f(cx - 0.95 * fw)} ${f(y + 0.12 * fw)} ${f(cx - T.x * fw)} ${f(y + T.y * fw)}`,
    `C ${f(cx - 1.85 * fw)} ${f(y + 0.4 * fw)} ${f(cx - 2.05 * fw)} ${f(y + 0.6 * fw)} ${f(cx - C.x * fw)} ${f(y + C.y * fw)}`,
    `L ${f(cx - 2.2 * fw)} ${f(H + 2)}`,
    `L ${f(cx + 2.2 * fw)} ${f(H + 2)}`,
    `L ${f(cx + C.x * fw)} ${f(y + C.y * fw)}`,
    `C ${f(cx + 2.05 * fw)} ${f(y + 0.6 * fw)} ${f(cx + 1.85 * fw)} ${f(y + 0.4 * fw)} ${f(cx + T.x * fw)} ${f(y + T.y * fw)}`,
    `C ${f(cx + 0.95 * fw)} ${f(y + 0.12 * fw)} ${f(cx + n + 0.3 * fw)} ${f(y + 0.03 * fw)} ${f(cx + n)} ${f(y)}`,
    // 圓領往下凹
    `C ${f(cx + n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx - n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx - n)} ${f(y)}`,
    "Z",
  ].join(" ");
}

/** 人像只保留到這條線以上（下面原本的衣服整個裁掉，由制服蓋住） */
export function personClipY({ collarY, fw }: UniformGeo): number {
  return collarY + 0.3 * fw;
}

/** 領口裡面（脖子後方）的暗色內裡：人像的脖子會蓋在上面，沒有脖子的地方才看得到 */
export function innerNeckPath({ cx, collarY, fw }: UniformGeo): string {
  const y = collarY;
  const n = 0.34 * fw;
  return `M ${f(cx - n)} ${f(y - 0.02 * fw)} C ${f(cx - n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx + n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx + n)} ${f(y - 0.02 * fw)} Z`;
}

/** 插肩袖的車縫線（讓衣服看起來是一件上衣，而不是一塊色塊） */
export function seamPaths({ cx, collarY, fw }: UniformGeo): string[] {
  const y = collarY;
  return [-1, 1].map(
    (s) => `M ${f(cx + s * 0.5 * fw)} ${f(y + 0.07 * fw)} C ${f(cx + s * 0.85 * fw)} ${f(y + 0.35 * fw)} ${f(cx + s * 1.05 * fw)} ${f(y + 0.8 * fw)} ${f(cx + s * 1.2 * fw)} ${f(y + 1.5 * fw)}`
  );
}

/** 領口的羅紋邊 */
export function collarPath({ cx, collarY, fw }: UniformGeo): string {
  const y = collarY;
  const n = 0.34 * fw;
  return `M ${f(cx - n)} ${f(y)} C ${f(cx - n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx + n * 0.7)} ${f(y + 0.3 * fw)} ${f(cx + n)} ${f(y)}`;
}

/** 兩條帽繩 */
export function stringsPaths({ cx, collarY, fw }: UniformGeo): string[] {
  const y = collarY + 0.2 * fw;
  return [-1, 1].map(
    (s) => `M ${f(cx + s * 0.16 * fw)} ${f(y)} C ${f(cx + s * 0.17 * fw)} ${f(y + 0.2 * fw)} ${f(cx + s * 0.13 * fw)} ${f(y + 0.4 * fw)} ${f(cx + s * 0.15 * fw)} ${f(y + 0.58 * fw)}`
  );
}

/** 胸前 logo 的位置與大小（配戴者的左胸＝畫面右側） */
export function logoBox({ cx, collarY, fw }: UniformGeo) {
  const size = 0.3 * fw;
  return { x: cx + 0.62 * fw, y: collarY + 0.52 * fw, size };
}

let logoImg: Promise<HTMLImageElement> | null = null;
export function loadLogo(): Promise<HTMLImageElement> {
  if (!logoImg) {
    logoImg = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = encodeURI(UNIFORM.logo);
    });
  }
  return logoImg;
}

/** 在 canvas 上畫帽子（人像之前） */
export function drawHood(ctx: CanvasRenderingContext2D, g: UniformGeo) {
  ctx.fillStyle = UNIFORM.hoodInner;
  ctx.fill(new Path2D(innerNeckPath(g)));
  if (!UNIFORM.hood) return;
  const grad = ctx.createLinearGradient(0, g.collarY - 0.35 * g.fw, 0, g.collarY + 0.45 * g.fw);
  grad.addColorStop(0, UNIFORM.hoodColor);
  grad.addColorStop(1, UNIFORM.hoodInner);
  ctx.fillStyle = grad;
  ctx.fill(new Path2D(hoodPath(g)));
}

/** 在 canvas 上畫衣身、領口、帽繩、logo（人像之後） */
export async function drawBody(ctx: CanvasRenderingContext2D, g: UniformGeo) {
  const body = new Path2D(bodyPath(g));
  const grad = ctx.createLinearGradient(0, g.collarY, 0, g.H);
  grad.addColorStop(0, UNIFORM.top);
  grad.addColorStop(1, UNIFORM.bottom);
  ctx.fillStyle = grad;
  ctx.fill(body);
  // 肩膀受光
  ctx.save();
  ctx.clip(body);
  for (const s of [-1, 1]) {
    const rg = ctx.createRadialGradient(g.cx + s * 1.05 * g.fw, g.collarY + 0.3 * g.fw, 0, g.cx + s * 1.05 * g.fw, g.collarY + 0.3 * g.fw, 0.9 * g.fw);
    rg.addColorStop(0, "rgba(255,255,255,0.09)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, g.collarY - g.fw, ctx.canvas.width, 3 * g.fw);
  }
  // 中線的暗部，衣服才有立體感
  const mid = ctx.createLinearGradient(g.cx - g.fw, 0, g.cx + g.fw, 0);
  mid.addColorStop(0, "rgba(0,0,0,0)");
  mid.addColorStop(0.5, "rgba(0,0,0,0.18)");
  mid.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mid;
  ctx.fillRect(g.cx - g.fw, g.collarY + 0.25 * g.fw, 2 * g.fw, g.H);
  // 插肩袖車縫線：暗線＋一條很淡的亮線
  ctx.lineCap = "round";
  for (const d of seamPaths(g)) {
    const path = new Path2D(d);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(1.2, 0.02 * g.fw);
    ctx.stroke(path);
    ctx.save();
    ctx.translate(1, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.restore();
  // 肩線的輪廓光
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(1, 0.012 * g.fw);
  ctx.stroke(body);
  // 領口羅紋
  ctx.strokeStyle = UNIFORM.trim;
  ctx.lineWidth = 0.075 * g.fw;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(collarPath(g)));
  // 帽繩
  ctx.strokeStyle = UNIFORM.string;
  ctx.lineWidth = Math.max(1.5, 0.026 * g.fw);
  for (const d of stringsPaths(g)) ctx.stroke(new Path2D(d));
  // logo
  try {
    const img = await loadLogo();
    const b = logoBox(g);
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(img, b.x - b.size / 2, b.y, b.size, b.size * ratio);
    ctx.globalAlpha = 1;
  } catch {
    /* logo 讀不到就不畫 */
  }
}
