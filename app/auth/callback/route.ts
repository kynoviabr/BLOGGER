import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const invitation = url.searchParams.get("invitation");
  const supabase = await getSupabaseServerClient();

  let authError: Error | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (tokenHash && type === "invite") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    authError = error;
  }
  if (authError) return NextResponse.redirect(new URL(`/login?error=invite`, request.url));

  if (invitation) {
    const { data: organizationId, error } = await supabase.rpc("accept_organization_invitation", { raw_token: invitation });
    if (!error && organizationId) {
      const response = NextResponse.redirect(new URL("/team?invitation=accepted", request.url));
      response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000,
      });
      response.cookies.delete("selected_blog_id");
      return response;
    }
  }
  return NextResponse.redirect(new URL("/", request.url));
}

