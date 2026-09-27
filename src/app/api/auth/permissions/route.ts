import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    // 開發環境可用 PM_DEV_USER 模擬登入身分（next dev 限定；正式環境不會走到）
    const email =
      session?.user?.email ||
      (process.env.NODE_ENV === "development" ? process.env.PM_DEV_USER : undefined);

    if (!email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const perms = await checkPermissions(email);
    
    // If running in development and no sheet is setup, we provide mock roles
    if (!perms) {
      if (process.env.NODE_ENV === "development" && !(process.env.SHEET_ID_PERMISSIONS || "14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ")) {
        return NextResponse.json({
          roles: {
            "basic": "editor",
            "hunting-mgmt": "editor"
          },
          hunterName: ""
        });
      }
      return NextResponse.json({ error: "Access Denied. User not found or resigned." }, { status: 403 });
    }

    return NextResponse.json({
      roles: perms.roles,
      hunterName: perms.hunterName,
    });
  } catch (error: any) {
    console.error("[DynamicPermissions API] Error fetching permissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch permissions" },
      { status: 500 }
    );
  }
}
