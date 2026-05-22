import { NextRequest, NextResponse } from "next/server";
import { upsertGitHubConnection } from "@/lib/server/auth-store";
import { encryptSecret } from "@/lib/server/crypto";
import {
  exchangeGitHubCode,
  fetchGitHubViewer,
  GitHubOAuthError,
} from "@/lib/server/github-oauth";

export const runtime = "nodejs";

const stateCookieName = "foundry_github_oauth_state";

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/", request.url);
  const expectedState = request.cookies.get(stateCookieName)?.value;
  const actualState = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    redirectUrl.searchParams.set("github", "denied");
    return redirectWithClearedState(redirectUrl);
  }

  if (!expectedState || !actualState || expectedState !== actualState) {
    redirectUrl.searchParams.set("github", "state_mismatch");
    return redirectWithClearedState(redirectUrl);
  }

  if (!code) {
    redirectUrl.searchParams.set("github", "missing_code");
    return redirectWithClearedState(redirectUrl);
  }

  try {
    const token = await exchangeGitHubCode(code);
    const viewer = await fetchGitHubViewer(token.accessToken);

    upsertGitHubConnection({
      accessTokenEncrypted: encryptSecret(token.accessToken),
      scope: token.scope,
      providerAccountId: String(viewer.id),
      providerUsername: viewer.login,
      name: viewer.name,
      email: viewer.email,
    });

    redirectUrl.searchParams.set("github", "connected");
    return redirectWithClearedState(redirectUrl);
  } catch (error) {
    if (error instanceof GitHubOAuthError) {
      redirectUrl.searchParams.set("github", error.code);
      return redirectWithClearedState(redirectUrl);
    }

    redirectUrl.searchParams.set("github", "connect_failed");
    return redirectWithClearedState(redirectUrl);
  }
}

function redirectWithClearedState(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete(stateCookieName);
  return response;
}
