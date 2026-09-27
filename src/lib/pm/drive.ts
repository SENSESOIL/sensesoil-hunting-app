/**
 * 工程照 → Google Drive（伺服器端）
 *
 * 為什麼經過 Google Apps Script：
 *   APP 的服務帳號沒有雲端硬碟空間（配額 0），不能在公司的資料夾裡建立檔案。
 *   Apps Script 以「資料夾擁有者（拾壤帳號）」的身分執行，檔案直接歸公司帳號所有、
 *   用公司的空間，也能設定 Drive 的「說明」欄（之後在 Drive 搜尋得到）。
 *   腳本原始碼與部署步驟：apps-script/工程照上傳.gs
 *
 * 環境變數：PHOTO_SCRIPT_URL（部署後的網頁應用程式網址）、PHOTO_SCRIPT_SECRET（與腳本裡的一致）
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function photoConfigured(): boolean {
  if (process.env.PHOTO_SCRIPT_URL && process.env.PHOTO_SCRIPT_SECRET) return true;
  return process.env.NODE_ENV === "development" && !!process.env.PM_DEV_PHOTO_DIR;
}

export interface DriveUploadInput {
  code: string;
  projectName: string;
  /** 已知的專案資料夾（第一次上傳後會記住） */
  folderId?: string;
  fileName: string;
  mimeType: string;
  description: string;
  /** base64（不含 data: 前綴） */
  data: string;
}

export interface DriveUploadResult {
  fileId: string;
  url: string;
  /** 專案資料夾（不是工程照子資料夾） */
  folderId?: string;
  photoFolderId?: string;
}

export async function uploadToDrive(input: DriveUploadInput): Promise<DriveUploadResult> {
  const url = process.env.PHOTO_SCRIPT_URL;
  const secret = process.env.PHOTO_SCRIPT_SECRET;

  // 開發環境沒有 Apps Script：存到本機資料夾，方便測試整個流程
  if ((!url || !secret) && process.env.NODE_ENV === "development" && process.env.PM_DEV_PHOTO_DIR) {
    const dir = path.join(process.env.PM_DEV_PHOTO_DIR, `${input.code} ${input.projectName}`, "工程照");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, input.fileName), Buffer.from(input.data, "base64"));
    await writeFile(path.join(dir, input.fileName + ".description.txt"), input.description, "utf8");
    return { fileId: `dev-${Date.now()}`, url: "about:blank", folderId: input.folderId || `dev-folder-${input.code}` };
  }
  if (!url || !secret) throw new Error("工程照上傳尚未設定（PHOTO_SCRIPT_URL）");

  // Apps Script 的網頁應用程式：POST 後會 302 轉址到結果頁，fetch 會自動跟過去
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret, action: "upload", ...input }),
    redirect: "follow",
    signal: AbortSignal.timeout(55_000),
  });
  const text = await res.text();
  let json: { ok?: boolean; error?: string } & Partial<DriveUploadResult>;
  try {
    json = JSON.parse(text);
  } catch {
    // 通常是權限頁（部署時「誰可以存取」沒有選「所有人」）
    throw new Error(`雲端硬碟腳本沒有回應 JSON（HTTP ${res.status}）。請確認部署設定為「所有人」可存取。`);
  }
  if (!json.ok || !json.fileId) throw new Error(json.error || "上傳到雲端硬碟失敗");
  return { fileId: json.fileId, url: json.url || `https://drive.google.com/file/d/${json.fileId}/view`, folderId: json.folderId, photoFolderId: json.photoFolderId };
}
