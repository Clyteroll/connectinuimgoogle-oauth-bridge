import { NextRequest, NextResponse } from "next/server";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  sub?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  hd?: string;
};

type OAuthState = {
  user_id: string;
  return_to?: string | null;
  passthrough_params?: Record<string, string> | null;
};

function parseState(rawState: string): OAuthState | null {
  try {
    const decoded = Buffer.from(rawState, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<OAuthState>;
    if (!parsed.user_id || typeof parsed.user_id !== "string") {
      return null;
    }

    return {
      user_id: parsed.user_id,
      return_to:
        typeof parsed.return_to === "string" ? parsed.return_to : undefined,
      passthrough_params:
        parsed.passthrough_params &&
        typeof parsed.passthrough_params === "object" &&
        !Array.isArray(parsed.passthrough_params)
          ? Object.entries(parsed.passthrough_params).reduce<
              Record<string, string>
            >((acc, [key, value]) => {
              if (typeof value === "string") {
                acc[key] = value;
              }
              return acc;
            }, {})
          : undefined,
    };
  } catch {
    // Backward compatibility with older state=user_id format.
    return { user_id: rawState };
  }
}

function getSafeReturnUrl(
  stateReturnTo: string | null | undefined,
  bubbleAppUrl: string
): URL {
  const fallbackUrl = new URL("/sso_sample_login", bubbleAppUrl);
  if (!stateReturnTo) {
    return fallbackUrl;
  }

  try {
    const candidate = new URL(stateReturnTo);
    const fallbackOrigin = new URL(bubbleAppUrl).origin;
    // Prevent open redirects: only allow return URLs from same Bubble origin.
    if (candidate.origin === fallbackOrigin) {
      return candidate;
    }
  } catch {
    return fallbackUrl;
  }

  return fallbackUrl;
}

function getCompanyFromUserInfo(userInfo: GoogleUserInfo): string | null {
  if (userInfo.hd) {
    return userInfo.hd;
  }

  if (!userInfo.email) {
    return null;
  }

  const emailParts = userInfo.email.split("@");
  if (emailParts.length !== 2 || !emailParts[1]) {
    return null;
  }

  return emailParts[1].toLowerCase();
}

function redirectOAuthFailure(
  parsedState: OAuthState | null,
  bubbleAppUrl: string,
  params: { google_error: string; google_error_description?: string }
): NextResponse {
  const redirectUrl = getSafeReturnUrl(parsedState?.return_to, bubbleAppUrl);
  if (parsedState?.passthrough_params) {
    for (const [key, value] of Object.entries(parsedState.passthrough_params)) {
      redirectUrl.searchParams.set(key, value);
    }
  }
  redirectUrl.searchParams.set("google_auth", "cancelled");
  redirectUrl.searchParams.set("google_error", params.google_error);
  if (params.google_error_description) {
    redirectUrl.searchParams.set(
      "google_error_description",
      params.google_error_description
    );
  }
  if (parsedState?.user_id) {
    redirectUrl.searchParams.set("bubble_user_id", parsedState.user_id);
  }
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawState = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauthErrorDescription =
    request.nextUrl.searchParams.get("error_description");
  const parsedState = rawState ? parseState(rawState) : null;
  const bubbleUserId = parsedState?.user_id;
  const bubbleAppUrl = process.env.BUBBLE_APP_URL;

  if (oauthError) {
    if (!bubbleAppUrl) {
      return NextResponse.json(
        { error: "Missing BUBBLE_APP_URL." },
        { status: 500 }
      );
    }
    return redirectOAuthFailure(parsedState, bubbleAppUrl, {
      google_error: oauthError,
      google_error_description: oauthErrorDescription ?? undefined,
    });
  }

  if (!code) {
    if (bubbleUserId && bubbleAppUrl) {
      return redirectOAuthFailure(parsedState, bubbleAppUrl, {
        google_error: "access_denied",
      });
    }
    return NextResponse.json(
      { error: "Missing code or state query parameter." },
      { status: 400 }
    );
  }

  if (!bubbleUserId) {
    return NextResponse.json(
      { error: "Missing or invalid state query parameter." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

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

  const redirectUrl = getSafeReturnUrl(parsedState?.return_to, bubbleAppUrl);
  if (parsedState?.passthrough_params) {
    for (const [key, value] of Object.entries(parsedState.passthrough_params)) {
      redirectUrl.searchParams.set(key, value);
    }
  }
  redirectUrl.searchParams.set("google_email", userInfo.email);
  redirectUrl.searchParams.set("google_sub", userInfo.sub);
  redirectUrl.searchParams.set(
    "google_verified",
    String(Boolean(userInfo.email_verified))
  );
  if (userInfo.given_name) {
    redirectUrl.searchParams.set("google_first_name", userInfo.given_name);
  }
  if (userInfo.family_name) {
    redirectUrl.searchParams.set("google_last_name", userInfo.family_name);
  }
  if (userInfo.name) {
    redirectUrl.searchParams.set("google_full_name", userInfo.name);
  }
  if (userInfo.picture) {
    redirectUrl.searchParams.set("google_photo", userInfo.picture);
  }
  // Prefer Google Workspace domain when available, otherwise fallback to email domain.
  const company = getCompanyFromUserInfo(userInfo);
  if (company) {
    redirectUrl.searchParams.set("google_company", company);
  }
  redirectUrl.searchParams.set("bubble_user_id", bubbleUserId);
  redirectUrl.searchParams.set("google_access_token", tokenData.access_token);
  if (tokenData.refresh_token) {
    redirectUrl.searchParams.set("google_refresh_token", tokenData.refresh_token);
  }

  return NextResponse.redirect(redirectUrl);
}
