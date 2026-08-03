const VERIFICATION = "google-site-verification: googled46210596bbf9069.html";

export function onRequestGet() {
  return new Response(VERIFICATION, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
