import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/portal-session";

// 端末の印(portal_device)は残す。次にログインしたとき「初めての端末」にならないようにするため。
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
