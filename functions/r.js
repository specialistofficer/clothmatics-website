/** Cloudflare Pages short-link bridge. Firebase records the attributed click
 * and then redirects to the Play Store with campaign/referrer parameters. */
export async function onRequestGet({ request }) {
  const code = new URL(request.url).searchParams.get("c") || "";
  const endpoint = new URL("https://us-central1-stylemateai-d5843.cloudfunctions.net/openShareLink");
  endpoint.searchParams.set("c", code);
  return Response.redirect(endpoint.toString(), 302);
}
