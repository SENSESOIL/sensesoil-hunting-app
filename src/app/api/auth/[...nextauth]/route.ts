// src/app/api/auth/[...nextauth]/route.ts
// NextAuth handler — catches all /api/auth/* routes

import { handlers } from "@/lib/auth-options";
export const { GET, POST } = handlers;
