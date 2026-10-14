"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useDynamicPermissions } from "@/hooks/useDynamicPermissions";

/* 分流頁已拿掉：點 Logo 直接進狩獵管理。
   這個路徑保留成自動轉址（其他頁面的 Logo 還連到這裡）：
   有「狩獵管理」權限 → 狩獵管理；沒有 → 狩獵覺醒。
   兩者之間切換：點左上角 Logo（狩獵管理 → 狩獵覺醒；狩獵覺醒 → 這裡 → 狩獵管理）。 */
export default function DiversionPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { permissions, isLoading, error } = useDynamicPermissions();
  const dev = process.env.NODE_ENV === "development";

  useEffect(() => {
    // 權限還沒讀到時先等，避免有權限的人被誤送到狩獵覺醒
    if (status === "loading" || isLoading) return;
    if (!session && !dev) {
      router.replace("/");
      return;
    }
    const roles: Record<string, string> = permissions?.roles || (session?.user as any)?.roles || {};
    if (dev && !session && !error && !Object.keys(roles).length) return; // 開發環境：等 /api/auth/permissions 回來
    const r = roles["狩獵管理"];
    const canMgmt = r === "admin" || r === "editor" || r === "user" || r === "viewer";
    router.replace(canMgmt ? "/hunting-mgmt" : "/basic-mission");
  }, [status, isLoading, error, session, permissions, dev, router]);

  return <main className="min-h-screen" />;
}
