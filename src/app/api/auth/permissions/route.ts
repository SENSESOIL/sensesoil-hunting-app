import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;

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
      return NextResponse.json({ roles: {}, hunterName: "" });
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
