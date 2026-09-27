/**
 * 拾壤 APP：工程照上傳到 Google 雲端硬碟
 * ─────────────────────────────────────────────────────────────
 * APP 的「＋」拍照上傳 → Vercel 伺服器 → 這支腳本（以你的帳號執行）→ 專案資料夾／工程照
 *
 * 為什麼要這支腳本：APP 的服務帳號沒有雲端硬碟空間，不能在你的資料夾裡建立檔案；
 * 這支腳本以「你」的身分執行，照片歸你的帳號所有、用你的空間，Drive 的「說明」欄也寫得進去。
 *
 * 部署（約 5 分鐘，只要做一次）：
 *   1. 用 sensesoil 帳號打開 https://script.google.com → 新專案，命名「拾壤 工程照上傳」
 *   2. 把這整份貼進 Code.gs（取代原本內容）
 *   3. 修改下面兩個設定：
 *        SECRET          ＝ Vercel 環境變數 PHOTO_SCRIPT_SECRET 的值（APP 的 .env.local 裡也有）
 *        ROOT_FOLDER_ID  ＝ 所有專案資料夾所在的「上層資料夾」ID（網址 folders/ 後面那一串）
 *   4. 上方選 testSetup → 執行 → 依指示授權（會看到「Google 尚未驗證」→ 進階 → 前往）
 *      執行紀錄出現「找到上層資料夾：…」就成功
 *   5. 右上「部署」→「新增部署作業」→ 類型「網頁應用程式」
 *        執行身分：我（你的帳號）
 *        誰可以存取：所有人        ← 一定要選這個，APP 的伺服器才呼叫得到（有 SECRET 保護）
 *   6. 複製「網頁應用程式網址」（…/exec）→ 貼到 Vercel 環境變數 PHOTO_SCRIPT_URL → Redeploy
 *
 * 找資料夾的規則：
 *   - APP 的專案資訊裡有貼「雲端資料夾」連結 → 直接用
 *   - 否則在上層資料夾底下（含第二層）找名稱含專案代碼的資料夾（例：「A08 寶山野村」「A08｜寶山野村」）
 *   - 找不到 → 在上層資料夾新建「代碼 專案名稱」
 *   - 專案資料夾裡找名稱含「工程照」的子資料夾（含第二層），沒有就新建「工程照」
 *   找到的結果會記住，下次直接用。
 */

const SECRET = '把 PHOTO_SCRIPT_SECRET 貼在這裡';
const ROOT_FOLDER_ID = '把上層資料夾 ID 貼在這裡';
const PHOTO_FOLDER_KEYWORD = '工程照';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!req || req.secret !== SECRET) return out_({ ok: false, error: '密鑰不符（PHOTO_SCRIPT_SECRET）' });
    if (req.action === 'ping') return out_({ ok: true });
    if (req.action === 'upload') return out_(upload_(req));
    return out_({ ok: false, error: '未知的動作' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'sensesoil-photo-upload' });
}

function upload_(req) {
  if (!req.code || !req.data || !req.fileName) return { ok: false, error: '資料不完整' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // 同時上傳多張時，避免重複建立資料夾
  let project, photos;
  try {
    project = findProjectFolder_(String(req.code), String(req.projectName || ''), req.folderId);
    photos = findOrCreatePhotoFolder_(project);
  } finally {
    lock.releaseLock();
  }
  const name = uniqueName_(photos, String(req.fileName));
  const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mimeType || 'image/jpeg', name);
  const file = photos.createFile(blob);
  if (req.description) file.setDescription(String(req.description).slice(0, 25000));
  return {
    ok: true,
    fileId: file.getId(),
    url: file.getUrl(),
    fileName: name,
    folderId: project.getId(),
    photoFolderId: photos.getId(),
  };
}

function findProjectFolder_(code, projectName, knownId) {
  if (knownId) {
    try { return DriveApp.getFolderById(knownId); } catch (e) { /* 資料夾被刪或沒權限 → 往下找 */ }
  }
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('project:' + code);
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { props.deleteProperty('project:' + code); }
  }
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const hits = [];
  scan_(root, 2, function (f) { if (codeMatches_(f.getName(), code)) hits.push(f); });
  let folder = null;
  if (hits.length === 1) folder = hits[0];
  else if (hits.length > 1) {
    // 多個候選：名稱也含專案名稱的優先，再來是名稱最短的
    hits.sort(function (a, b) {
      const an = projectName && a.getName().indexOf(projectName) >= 0 ? 0 : 1;
      const bn = projectName && b.getName().indexOf(projectName) >= 0 ? 0 : 1;
      return an - bn || a.getName().length - b.getName().length;
    });
    folder = hits[0];
  }
  if (!folder) folder = root.createFolder((code + ' ' + projectName).trim());
  props.setProperty('project:' + code, folder.getId());
  return folder;
}

function findOrCreatePhotoFolder_(project) {
  let found = null;
  scan_(project, 2, function (f) { if (!found && f.getName().indexOf(PHOTO_FOLDER_KEYWORD) >= 0) found = f; });
  return found || project.createFolder(PHOTO_FOLDER_KEYWORD);
}

/** 往下走 depth 層，對每個子資料夾呼叫 fn */
function scan_(folder, depth, fn) {
  const it = folder.getFolders();
  const next = [];
  while (it.hasNext()) {
    const f = it.next();
    fn(f);
    if (depth > 1) next.push(f);
  }
  next.forEach(function (f) { scan_(f, depth - 1, fn); });
}

/** 名稱裡有獨立的代碼（A08 不會誤中 A080、BA08） */
function codeMatches_(name, code) {
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-Za-z0-9])' + esc + '([^A-Za-z0-9]|$)', 'i').test(name);
}

function uniqueName_(folder, name) {
  if (!folder.getFilesByName(name).hasNext()) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 100; i++) {
    const n = stem + '-' + i + ext;
    if (!folder.getFilesByName(n).hasNext()) return n;
  }
  return stem + '-' + Date.now() + ext;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 部署前手動執行一次：授權＋確認上層資料夾設定正確 */
function testSetup() {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  Logger.log('找到上層資料夾：' + root.getName());
  let n = 0;
  scan_(root, 1, function (f) { if (n++ < 10) Logger.log('  子資料夾：' + f.getName()); });
  Logger.log('SECRET 已設定：' + (SECRET.indexOf('貼在這裡') < 0 ? '是' : '否（請先修改）'));
}
