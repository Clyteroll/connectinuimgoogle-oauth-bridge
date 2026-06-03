import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  const returnTo = request.nextUrl.searchParams.get("return_to");
  const passthroughParams = Array.from(request.nextUrl.searchParams.entries())
    .filter(([key]) => key !== "user_id" && key !== "return_to")
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user_id query parameter." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI." },
      { status: 500 }
    );
  }

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent select_account");

  // Keep state backward-compatible while allowing optional return destination.
  const statePayload = {
    user_id: userId,
    return_to: returnTo || null,
    passthrough_params:
      Object.keys(passthroughParams).length > 0 ? passthroughParams : null,
  };
  const encodedState = Buffer.from(JSON.stringify(statePayload)).toString(
    "base64url"
  );
  googleAuthUrl.searchParams.set("state", encodedState);

  return NextResponse.redirect(googleAuthUrl);
}
