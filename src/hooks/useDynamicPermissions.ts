import useSWR from "swr";
import { useSession } from "next-auth/react";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch permissions");
  return res.json();
});

export interface DynamicPermissions {
  roles: { [key: string]: "admin" | "editor" | "viewer" | "none" };
  hunterName: string;
}

export function useDynamicPermissions() {
  const { data: session, status } = useSession();
  
  const { data, error, isLoading } = useSWR<DynamicPermissions>(
    status === "authenticated" ? "/api/auth/permissions" : null,
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
    permissions: data || null,
    isLoading: status === "loading" || (status === "authenticated" && isLoading),
    error,
    session,
    status
  };
}
