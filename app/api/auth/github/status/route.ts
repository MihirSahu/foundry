import { NextResponse } from "next/server";
import { getGitHubConnection } from "@/lib/server/auth-store";
import { isGitHubOAuthConfigured } from "@/lib/server/github-oauth";

export const runtime = "nodejs";

export function GET() {
  const configured = isGitHubOAuthConfigured();
  const connection = getGitHubConnection();

  if (!configured) {
    return NextResponse.json({ configured, connected: false });
  }

  if (!connection?.accessTokenEncrypted) {
    return NextResponse.json({ configured, connected: false });
  }

  return NextResponse.json({
    configured,
    connected: true,
    username: connection.providerUsername,
    scope: connection.scope,
    providerAccountId: connection.providerAccountId,
  });
}
