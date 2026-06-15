// Parse léger d'un user-agent → "Appareil · Navigateur" lisible pour le SAV.
export function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Appareil inconnu"
  let device = "Ordinateur"
  if (/iPhone/i.test(ua)) device = "iPhone"
  else if (/iPad/i.test(ua)) device = "iPad"
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? "Android (mobile)" : "Android (tablette)"
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac"
  else if (/Windows/i.test(ua)) device = "Windows"
  else if (/Linux/i.test(ua)) device = "Linux"

  let browser = "Navigateur"
  if (/Edg\//i.test(ua)) browser = "Edge"
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera"
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome"
  else if (/Firefox\//i.test(ua)) browser = "Firefox"
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) browser = "Safari"

  return `${device} · ${browser}`
}
