const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");
const { GOVT_SCHEMES } = require("./schemes_data.js");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function seed() {
  const batch = db.batch();

  for (const scheme of GOVT_SCHEMES) {
    const { id, ...data } = scheme;
    const ref = db.collection("govt_schemes").doc(id);
    batch.set(ref, data);
  }

  await batch.commit();
  console.log(`Seeded ${GOVT_SCHEMES.length} schemes into govt_schemes collection.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });