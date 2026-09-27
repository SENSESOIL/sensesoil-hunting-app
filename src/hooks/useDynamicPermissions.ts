import useSWR from "swr";
import { useSession } from "next-auth/react";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch permissions");
  return res.json();
});

export interface DynamicPermissions {
  roles: { [key: string]: "admin" | "editor" | "user" | "viewer" | "none" };
  hunterName: string;
}

export function useDynamicPermissions() {
  const { data: session, status } = useSession();
  
  const { data, error, isLoading } = useSWR<DynamicPermissions>(
    // 開發環境沒登入也去問（伺服器端可用 PM_DEV_USER 模擬身分）
    status === "authenticated" || (process.env.NODE_ENV === "development" && status === "unauthenticated")
      ? "/api/auth/permissions"
      : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      // refresh interval could be added if needed, but revalidateOnFocus is usually enough for quick updates.
      // dedupingInterval ensures we don't spam the API unnecessarily within the same second
      dedupingInterval: 5000, 
    }
  );

  return {
    permissions: data || {
      roles: (session?.user as any)?.roles || {},
      hunterName: (session?.user as any)?.hunterName || session?.user?.name || "",
    },
    isLoading: status === "loading" || (status === "authenticated" && isLoading),
    error,
    session,
    status
  };
}
