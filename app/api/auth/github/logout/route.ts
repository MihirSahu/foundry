import { NextResponse } from "next/server";
import { deleteGitHubConnection } from "@/lib/server/auth-store";

export const runtime = "nodejs";

export function POST() {
  deleteGitHubConnection();

  return NextResponse.json({ connected: false });
}
