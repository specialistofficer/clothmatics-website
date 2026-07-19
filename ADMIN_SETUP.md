# ClothMatics administrator access

The web dashboard at `/admin.html` requires both:

1. The exact Firebase Authentication email `chiragsharma376@gmail.com`.
2. A Firebase ID-token custom claim `{ admin: true }`.

The email check controls the UI. The custom claim is enforced by the deployed
Firestore Security Rules and cannot be granted from browser code.

## Grant the claim once

Run this only from the trusted React Native project directory, where
`firebase-admin` is already a development dependency and the service account
credential is stored locally. Never commit or upload the service-account JSON.

Create a temporary local script outside Git, or run the equivalent in an
existing trusted admin script:

```js
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });

(async () => {
  const email = "chiragsharma376@gmail.com";
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    admin: true,
  });
  console.log(`Admin enabled for ${email}`);
})();
```

After it runs, sign out of ClothMatics and sign back in so Firebase issues a
fresh ID token containing the claim. Then open `/admin.html`.

## Important

- Do not add `serviceAccountKey.json` to the website repository.
- Do not put the service-account contents in Cloudflare variables.
- Do not replace the custom-claim check with a browser-only email check.
