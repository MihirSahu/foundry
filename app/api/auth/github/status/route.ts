import { NextResponse } from "next/server";
import { getGitHubConnection } from "@/lib/server/auth-store";

export const runtime = "nodejs";

export function GET() {
  const connection = getGitHubConnection();

  if (!connection?.accessTokenEncrypted) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    username: connection.providerUsername,
    scope: connection.scope,
    providerAccountId: connection.providerAccountId,
  });
}
