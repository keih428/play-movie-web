import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAMES = ["portal_session", "portal_device"];
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

// 部内ページのログインを、開くたびに400日先まで延ばし直す(使っている限り切れない)。
// 中身の確認はここではしない。ページと API の側で確かめる。
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  for (const name of COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) {
      response.cookies.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/t/:path*"],
};
