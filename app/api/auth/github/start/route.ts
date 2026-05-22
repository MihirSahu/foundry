import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildGitHubAuthorizeUrl, GitHubOAuthError } from "@/lib/server/github-oauth";

export const runtime = "nodejs";

const stateCookieName = "foundry_github_oauth_state";

export function GET() {
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(buildGitHubAuthorizeUrl(state));

    response.cookies.set(stateCookieName, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    if (error instanceof GitHubOAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: { code: "oauth_start_failed", message: "Unable to start GitHub OAuth." } },
      { status: 500 },
    );
  }
}
