import { NextRequest, NextResponse } from "next/server";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  sub?: string;
  email_verified?: boolean;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const bubbleUserId = request.nextUrl.searchParams.get("state");

  if (!code || !bubbleUserId) {
    return NextResponse.json(
      { error: "Missing code or state query parameter." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const bubbleAppUrl = process.env.BUBBLE_APP_URL;

  if (!clientId || !clientSecret || !redirectUri || !bubbleAppUrl) {
    return NextResponse.json(
      {
        error:
          "Missing one or more required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BUBBLE_APP_URL.",
      },
      { status: 500 }
    );
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.json(
      {
        error: "Google token exchange failed.",
        details: tokenData.error_description || tokenData.error || null,
      },
      { status: 502 }
    );
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
    }
  );

  const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
  if (!userInfoResponse.ok || !userInfo.email || !userInfo.sub) {
    return NextResponse.json(
      { error: "Failed to fetch Google userinfo." },
      { status: 502 }
    );
  }

  const redirectUrl = new URL("/sso_sample_login", bubbleAppUrl);
  redirectUrl.searchParams.set("google_email", userInfo.email);
  redirectUrl.searchParams.set("google_sub", userInfo.sub);
  redirectUrl.searchParams.set(
    "google_verified",
    String(Boolean(userInfo.email_verified))
  );
  redirectUrl.searchParams.set("bubble_user_id", bubbleUserId);

  return NextResponse.redirect(redirectUrl);
}
