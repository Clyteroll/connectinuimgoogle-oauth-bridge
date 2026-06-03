import { NextRequest, NextResponse } from "next/server";

type RevokeRequest = {
  token?: string;
};

async function revokeGoogleToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  });

  return response;
}

export async function POST(request: NextRequest) {
  let token: string | null = null;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as RevokeRequest;
    token = body.token || null;
  } else {
    const formData = await request.formData();
    const rawToken = formData.get("token");
    token = typeof rawToken === "string" ? rawToken : null;
  }

  if (!token) {
    return NextResponse.json(
      { error: "Missing token. Provide access or refresh token to revoke." },
      { status: 400 }
    );
  }

  const revokeResponse = await revokeGoogleToken(token);
  if (!revokeResponse.ok) {
    const details = await revokeResponse.text();
    return NextResponse.json(
      { error: "Google revoke request failed.", details: details || null },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, revoked: true });
}
