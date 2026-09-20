import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 回報「目前這個部署」的建置識別碼。
// 用戶端把建置時內嵌的識別碼拿來比對，不一致就代表它跑的是舊版，強制重載。
export async function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";

  return NextResponse.json(
    { build },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
