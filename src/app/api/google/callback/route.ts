import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: "http://localhost:3000/api/google/callback",
      grant_type: "authorization_code",
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error) {
    return NextResponse.json({ error: tokens.error, description: tokens.error_description }, { status: 400 })
  }

  // Show the refresh token to the user
  return new NextResponse(
    `<html>
      <head><title>Google Ads Connecté</title></head>
      <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px;">
        <h1>✅ Google Ads connecté !</h1>
        <p>Copie ce <strong>Refresh Token</strong> et donne-le à Claude :</p>
        <pre style="background: #f4f4f5; padding: 16px; border-radius: 8px; word-break: break-all; font-size: 14px;">${tokens.refresh_token}</pre>
        <p style="color: #71717a; font-size: 14px;">Access Token (temporaire) : ${tokens.access_token?.substring(0, 30)}...</p>
        <p style="margin-top: 24px;"><a href="http://localhost:3000/dashboard" style="color: #18181b; font-weight: 600;">← Retour au Dashboard</a></p>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } }
  )
}
