#!/usr/bin/env python3
"""Génère un nouveau refresh token Google Ads (OAuth installed-app flow).
Lance un mini-serveur local qui attend la redirection après autorisation.
Usage: python3 scripts/google_oauth.py   (les creds viennent de l'env)
"""
import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SCOPES = ["https://www.googleapis.com/auth/adwords"]
PORT = 8810

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans l'env", file=sys.stderr)
    sys.exit(1)

flow = InstalledAppFlow.from_client_config(
    {
        "installed": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"http://localhost:{PORT}/"],
        }
    },
    scopes=SCOPES,
)

creds = flow.run_local_server(
    host="localhost",
    port=PORT,
    open_browser=False,
    authorization_prompt_message="AUTH_URL={url}",
    success_message="Autorisation reçue. Tu peux fermer cet onglet.",
    access_type="offline",
    prompt="consent",
)

print("REFRESH_TOKEN=" + (creds.refresh_token or "NONE"), flush=True)
