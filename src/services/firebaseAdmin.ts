import admin from 'firebase-admin';

// Initialize Firebase Admin SDK once per process. Credentials are read from
// environment variables to avoid committing secrets.
// Required env vars:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY (escape newlines as \n)
// - FIREBASE_STORAGE_BUCKET (e.g. my-project.appspot.com)

let app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKeyRaw || !storageBucket) {
    throw new Error('Missing Firebase credentials. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
  });
  return app;
}

export function getStorageBucket() {
  const application = getFirebaseApp();
  return application.storage().bucket();
}

