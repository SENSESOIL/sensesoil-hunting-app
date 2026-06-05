// src/lib/auth-options.ts
// NextAuth v5 configuration with Google OAuth provider

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { checkPermissions } from "@/lib/permissions";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days — for PWA persistent login
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email;
      if (!email) return false;

      // 如果在開發環境，且尚未設定 Google Sheets，直接放行方便測試
      if (process.env.NODE_ENV === "development" && !process.env.SHEET_ID_PERMISSIONS) {
        return true;
      }

      const perms = await checkPermissions(email);
      
      // 如果設定了 Google Sheet，但信箱不在權限名單內，則無條件拒絕登入 (無論是否為開發環境)
      if (!perms && process.env.SHEET_ID_PERMISSIONS) {
        return false;
      }
      return true;
    },
    async jwt({ token, account, user }) {
      // Store access token for potential write operations
      if (account) {
        token.accessToken = account.access_token;
      }
      
      const email = token.email || user?.email;
      if (email) {
        const perms = await checkPermissions(email);
        console.log(`[NextAuth JWT] Email: ${email}, perms:`, perms);
        if (perms) {
          token.roles = perms.roles;
          token.hunterName = perms.hunterName;
        } else if (process.env.NODE_ENV === "development" && !process.env.SHEET_ID_PERMISSIONS) {
          // 開發環境中，若完全沒設定權限表，才預設給予 editor 權限
          token.roles = {
            "basic": "editor",
            "hunting-mgmt": "editor"
          };
        } else {
          token.roles = {};
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Expose access token to client for write permission checks
      (session as any).accessToken = token.accessToken as string;
      if (session.user) {
        (session.user as any).roles = token.roles || {};
        (session.user as any).hunterName = token.hunterName || "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/verify",
  },
});
