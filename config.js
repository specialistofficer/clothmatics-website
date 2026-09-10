// ClothMatics Firebase project. These identifiers are public client
// configuration; Firestore Security Rules protect user data.
export const firebaseConfig = {
  apiKey: "AIzaSyAr6Nu5XbmdABD080o1S-Wa06wMmAcoxxE",
  authDomain: "stylemateai-d5843.firebaseapp.com",
  projectId: "stylemateai-d5843",
  storageBucket: "stylemateai-d5843.firebasestorage.app",
  messagingSenderId: "24255311335",
  appId: "1:24255311335:web:8adcee3890c86771496142",
};

// Public service locations. Authentication and authorization are enforced by
// Firebase ID tokens and the Workers; no provider credentials live here.
export const CORE_API_URL = "https://clothmatics-core-api.chiragsharma376.workers.dev";
export const AI_GATEWAY_URL = "https://clothmatics-ai-gateway.chiragsharma376.workers.dev";
export const UPLOAD_WORKER_URL = "https://clothmatics-upload-worker.chiragsharma376.workers.dev";
export const GHOST_MANNEQUIN_API_URL = "https://clothmatics-ghost.chiragsharma376.workers.dev/generate";
