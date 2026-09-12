// The deployment preparer replaces CODE with the credential-free reviewed
// Kaggle runner source. Keeping this route in the source tree ensures Pages
// includes it in the Functions route manifest.
const CODE = "Deployment preparation did not embed the Kaggle source.";

export function onRequestGet() {
  return new Response(CODE, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
