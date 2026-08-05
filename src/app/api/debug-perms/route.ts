import { NextResponse } from "next/server";
import { checkPermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  const perms = await checkPermissions("sensesoil.tw@gmail.com");
  return NextResponse.json({ perms });
}
