/**
 * ============================================================================
 *  Asha Plus — Complete Firebase Cloud Functions Backend
 * ============================================================================
 *
 *  Exports (all Gen 2):
 *
 *  AUTH & USER MANAGEMENT
 *  ├── initializeAdmin     HTTP  — one-time bootstrap: creates first super_admin
 *  ├── createUser          callable — admin creates asha/patient accounts
 *  ├── updateUserRole      callable — super_admin reassigns roles
 *  ├── deleteAuthUser      callable — admin deletes a user
 *  └── listUsers           callable — admin fetches all user profiles
 *
 *  PATIENTS
 *  ├── addPatient          callable — admin/asha adds a patient record
 *  ├── updatePatient       callable — admin/asha edits a patient record
 *  └── deletePatient       callable — admin deletes patient + all their visits
 *
 *  VISIT HISTORY
 *  ├── addVisit            callable — admin/asha logs a visit
 *  ├── updateVisit         callable — admin/asha edits a visit
 *  └── deleteVisit         callable — admin/asha removes a visit
 *
 *  GOVERNMENT SCHEMES
 *  ├── addScheme           callable — admin creates a scheme
 *  ├── updateScheme        callable — admin edits a scheme
 *  └── deleteScheme        callable — admin removes a scheme
 *
 *  ASHA AI HEALTH ASSISTANT
 *  └── askHealthAssistant  callable — cache-first, 3-provider AI fallback
 *
 * ============================================================================
 */

"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions }              = require("firebase-functions/v2");
const { defineSecret }                  = require("firebase-functions/params");
const logger                            = require("firebase-functions/logger");
const { initializeApp }                 = require("firebase-admin/app");
const { getAuth }                       = require("firebase-admin/auth");
const { getFirestore, FieldValue }      = require("firebase-admin/firestore");
const crypto                            = require("crypto");

// ── AI provider SDKs (used by askHealthAssistant) ──────────────────────────
const { GoogleGenAI }    = require("@google/genai");
const Groq               = require("groq-sdk");
const { InferenceClient } = require("@huggingface/inference");

// ── Firebase init ──────────────────────────────────────────────────────────
initializeApp();
const db   = getFirestore();
const auth = getAuth();

// ── Run in Mumbai — closest to Indian users ────────────────────────────────
setGlobalOptions({ region: "asia-south1" });

// ── Secrets (stored in Google Cloud Secret Manager, never in source) ───────
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GROQ_API_KEY   = defineSecret("GROQ_API_KEY");
const HF_TOKEN       = defineSecret("HF_TOKEN");
const SETUP_TOKEN    = defineSecret("SETUP_TOKEN");   // protects initializeAdmin

// ── Role constants ─────────────────────────────────────────────────────────
const ROLES = { SUPER_ADMIN: "super_admin", ADMIN: "admin", ASHA: "asha", PATIENT: "patient" };

// ── Firestore collections ──────────────────────────────────────────────────
const COL = {
  USERS:    "users",
  PATIENTS: "patients",
  SCHEMES:  "govt_schemes",
  CACHE:    "cached_responses",
};

// =============================================================================
//  SHARED HELPERS
// =============================================================================

/**
 * Throw an HttpsError if the caller is not signed in or lacks the required role.
 * Role is read directly from the Firebase custom claim on the JWT — no Firestore
 * roundtrip needed at call time.
 */
function assertRole(request, ...allowedRoles) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to do this.");
  }
  const callerRole = request.auth.token.role;
  if (!allowedRoles.includes(callerRole)) {
    throw new HttpsError(
      "permission-denied",
      `Required role: ${allowedRoles.join(" or ")}. Your role: ${callerRole || "none"}.`
    );
  }
}

/** Require a field; throws invalid-argument if missing/empty. */
function require(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new HttpsError("invalid-argument", `"${fieldName}" is required.`);
  }
}

// =============================================================================
//  1. INITIALIZE ADMIN  (HTTP — called once to bootstrap the system)
// =============================================================================
/**
 * POST  https://asia-south1-<projectId>.cloudfunctions.net/initializeAdmin
 * Body: { setupToken, email, password, name }
 *
 * Creates the very first super_admin account. Blocked after that.
 * Protect with SETUP_TOKEN secret — only the developer runs this once.
 */
exports.initializeAdmin = onRequest(
  { secrets: [SETUP_TOKEN] },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const { setupToken, email, password, name } = req.body || {};

    if (!setupToken || setupToken !== process.env.SETUP_TOKEN) {
      return res.status(403).json({ error: "Invalid or missing setup token." });
    }
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    // Block if any super_admin already exists
    const existingSnap = await db
      .collection(COL.USERS)
      .where("role", "==", ROLES.SUPER_ADMIN)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(409).json({ error: "Super admin already initialized. Use the app to manage users." });
    }

    try {
      const userRecord = await auth.createUser({ email, password, displayName: name });
      await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.SUPER_ADMIN });

      await db.collection(COL.USERS).doc(userRecord.uid).set({
        uid:       userRecord.uid,
        name,
        email,
        role:      ROLES.SUPER_ADMIN,
        mobile:    "",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system_bootstrap",
      });

      logger.info("Super admin initialized", { uid: userRecord.uid, email });
      return res.status(201).json({
        success: true,
        message: "✅ Super admin created. You can now log in via the app.",
        uid: userRecord.uid,
      });
    } catch (err) {
      logger.error("initializeAdmin failed", err);
      if (err.code === "auth/email-already-exists") {
        return res.status(409).json({ error: "This email is already registered in Firebase Auth." });
      }
      return res.status(500).json({ error: err.message });
    }
  }
);

// =============================================================================
//  2. CREATE USER  (admin or super_admin creates asha/patient/admin accounts)
// =============================================================================
exports.createUser = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const { email, password, name, role, mobile = "", location = "" } = request.data || {};

  require(email,    "email");
  require(password, "password");
  require(name,     "name");
  require(role,     "role");

  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  // Regular admins can only create asha/patient; super_admin can also create admin
  const callerRole = request.auth.token.role;
  const creatableRoles = callerRole === ROLES.SUPER_ADMIN
    ? [ROLES.ADMIN, ROLES.ASHA, ROLES.PATIENT]
    : [ROLES.ASHA, ROLES.PATIENT];

  if (!creatableRoles.includes(role)) {
    throw new HttpsError(
      "permission-denied",
      `You cannot create a user with role "${role}". Allowed: ${creatableRoles.join(", ")}.`
    );
  }

  try {
    const userRecord = await auth.createUser({ email, password, displayName: name });
    await auth.setCustomUserClaims(userRecord.uid, { role });

    // Build Firestore profile
    const profile = {
      uid:       userRecord.uid,
      name,
      email,
      role,
      mobile,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    };
    if (role === ROLES.ASHA) {
      profile.location = location;
      profile.id       = `ASHA-${userRecord.uid.slice(0, 6).toUpperCase()}`;
    }
    if (role === ROLES.PATIENT) {
      profile.id = `P-${userRecord.uid.slice(0, 6).toUpperCase()}`;
    }

    await db.collection(COL.USERS).doc(userRecord.uid).set(profile);

    logger.info("User created", { uid: userRecord.uid, role, email });
    return { success: true, uid: userRecord.uid, message: `${role} account created successfully.` };
  } catch (err) {
    logger.error("createUser failed", err);
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email is already registered.");
    }
    if (err.code === "auth/invalid-email") {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    throw new HttpsError("internal", "Failed to create user: " + err.message);
  }
});

// =============================================================================
//  3. UPDATE USER ROLE  (super_admin only)
// =============================================================================
exports.updateUserRole = onCall(async (request) => {
  assertRole(request, ROLES.SUPER_ADMIN);

  const { uid, newRole } = request.data || {};
  require(uid,     "uid");
  require(newRole, "newRole");

  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(newRole)) {
    throw new HttpsError("invalid-argument", `Invalid role: "${newRole}". Valid: ${validRoles.join(", ")}.`);
  }
  // Prevent reassigning yourself
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You cannot change your own role.");
  }

  try {
    await auth.setCustomUserClaims(uid, { role: newRole });
    await db.collection(COL.USERS).doc(uid).update({
      role:      newRole,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
    return { success: true, message: `Role updated to "${newRole}".` };
  } catch (err) {
    logger.error("updateUserRole failed", err);
    throw new HttpsError("internal", err.message);
  }
});

// =============================================================================
//  4. DELETE AUTH USER  (admin or super_admin)
// =============================================================================
exports.deleteAuthUser = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const { uid } = request.data || {};
  require(uid, "uid");

  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }

  // Prevent deleting a super_admin (extra safety)
  const target = await db.collection(COL.USERS).doc(uid).get();
  if (target.exists && target.data().role === ROLES.SUPER_ADMIN) {
    throw new HttpsError("permission-denied", "Super admin accounts cannot be deleted.");
  }

  try {
    await auth.deleteUser(uid);
    await db.collection(COL.USERS).doc(uid).delete();
    return { success: true, message: "User deleted successfully." };
  } catch (err) {
    logger.error("deleteAuthUser failed", err);
    throw new HttpsError("internal", err.message);
  }
});

// =============================================================================
//  5. LIST USERS  (admin or super_admin — returns all user profiles)
// =============================================================================
exports.listUsers = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  try {
    const snap = await db.collection(COL.USERS).orderBy("createdAt", "desc").get();
    const users = snap.docs.map((doc) => {
      const d = doc.data();
      // Never send a password field to the client (none stored, but be explicit)
      const { password: _pw, ...safe } = d;
      return safe;
    });
    return { users };
  } catch (err) {
    logger.error("listUsers failed", err);
    throw new HttpsError("internal", err.message);
  }
});

// =============================================================================
//  6. PATIENT CRUD
// =============================================================================

/** Auto-generate a sequential patient ID like P001, P002… */
async function nextPatientId() {
  const snap = await db.collection(COL.PATIENTS).count().get();
  const n = (snap.data().count || 0) + 1;
  return `P${String(n).padStart(3, "0")}`;
}

exports.addPatient = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);

  const d = request.data || {};
  require(d.name,   "name");
  require(d.mobile, "mobile");

  const patientId = await nextPatientId();

  const patient = {
    id:         patientId,
    name:       d.name.trim(),
    age:        d.age        || "",
    gender:     d.gender     || "",
    blood:      d.blood      || "",
    mobile:     d.mobile.trim(),
    email:      d.email      || "",
    village:    d.village    || "",
    state:      d.state      || "",
    diseases:   d.diseases   || "None",
    registered: new Date().toISOString().split("T")[0],
    createdAt:  FieldValue.serverTimestamp(),
    createdBy:  request.auth.uid,
  };

  await db.collection(COL.PATIENTS).doc(patientId).set(patient);
  logger.info("Patient added", { patientId, createdBy: request.auth.uid });
  return { success: true, patientId, patient };
});

exports.updatePatient = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);

  const { patientId, updates } = request.data || {};
  require(patientId, "patientId");
  require(updates,   "updates");

  // Whitelist editable fields
  const EDITABLE = ["name", "age", "gender", "blood", "mobile", "email", "village", "state", "diseases"];
  const safe = {};
  EDITABLE.forEach((k) => { if (updates[k] !== undefined) safe[k] = updates[k]; });
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = request.auth.uid;

  if (Object.keys(safe).length <= 2) {
    throw new HttpsError("invalid-argument", "No valid fields provided to update.");
  }

  await db.collection(COL.PATIENTS).doc(patientId).update(safe);
  return { success: true };
});

exports.deletePatient = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const { patientId } = request.data || {};
  require(patientId, "patientId");

  // Delete all visits in a batch
  const visitsSnap = await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").get();

  const batch = db.batch();
  visitsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection(COL.PATIENTS).doc(patientId));
  await batch.commit();

  logger.info("Patient deleted", { patientId, deletedBy: request.auth.uid });
  return { success: true };
});

// =============================================================================
//  7. VISIT HISTORY CRUD  (stored as subcollection: patients/{id}/visits/{id})
// =============================================================================

exports.addVisit = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);

  const { patientId, visit } = request.data || {};
  require(patientId, "patientId");
  require(visit,     "visit");

  const visitRef = db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").doc();

  const visitData = {
    id:          visitRef.id,
    date:        visit.date        || new Date().toISOString().split("T")[0],
    worker:      visit.worker      || "",
    type:        visit.type        || { en: "", hi: "" },
    note:        visit.note        || { en: "", hi: "" },
    healthAlert: visit.healthAlert || { en: "", hi: "" },
    precaution:  visit.precaution  || { en: "", hi: "" },
    bp:          visit.bp          || "",
    sugar:       visit.sugar       || "",
    weight:      visit.weight      || "",
    temperature: visit.temperature || "",
    pulse:       visit.pulse       || "",
    spo2:        visit.spo2        || "",
    createdAt:   FieldValue.serverTimestamp(),
    createdBy:   request.auth.uid,
  };

  await visitRef.set(visitData);
  return { success: true, visitId: visitRef.id };
});

exports.updateVisit = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);

  const { patientId, visitId, updates } = request.data || {};
  require(patientId, "patientId");
  require(visitId,   "visitId");
  require(updates,   "updates");

  // Strip protected fields from the updates payload
  const { id: _id, createdAt: _ca, createdBy: _cb, ...safe } = updates;
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = request.auth.uid;

  await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").doc(visitId)
    .update(safe);

  return { success: true };
});

exports.deleteVisit = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);

  const { patientId, visitId } = request.data || {};
  require(patientId, "patientId");
  require(visitId,   "visitId");

  await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").doc(visitId)
    .delete();

  return { success: true };
});

// =============================================================================
//  8. GOVERNMENT SCHEMES CRUD  (admin only — patients can read via Firestore)
// =============================================================================

exports.addScheme = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const d = request.data || {};
  require(d.title, "title");

  const schemeRef = db.collection(COL.SCHEMES).doc();
  await schemeRef.set({
    id:          schemeRef.id,
    title:       d.title        || "",
    titleHi:     d.titleHi      || "",
    category:    d.category     || "",
    description: d.description  || "",
    descHi:      d.descHi       || "",
    eligibility: d.eligibility  || [],
    eligHi:      d.eligHi       || [],
    benefits:    d.benefits     || [],
    benefitsHi:  d.benefitsHi   || [],
    applyUrl:    d.applyUrl     || "",
    createdAt:   FieldValue.serverTimestamp(),
    createdBy:   request.auth.uid,
  });

  return { success: true, schemeId: schemeRef.id };
});

exports.updateScheme = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const { schemeId, updates } = request.data || {};
  require(schemeId, "schemeId");
  require(updates,  "updates");

  const { id: _id, createdAt: _ca, createdBy: _cb, ...safe } = updates;
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = request.auth.uid;

  await db.collection(COL.SCHEMES).doc(schemeId).update(safe);
  return { success: true };
});

exports.deleteScheme = onCall(async (request) => {
  assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN);

  const { schemeId } = request.data || {};
  require(schemeId, "schemeId");

  await db.collection(COL.SCHEMES).doc(schemeId).delete();
  return { success: true };
});

// =============================================================================
//  9. ASHA AI HEALTH ASSISTANT  (cache-first, 3-provider fallback)
// =============================================================================

const AI_SYSTEM_PROMPT =
  "You are Asha AI, a helpful health assistant built into a healthcare app " +
  "used by ASHA workers and patients across rural India. Provide brief, " +
  "accurate, compassionate health information. Always advise the user to " +
  "consult a real doctor for serious or persistent issues. " +
  "Answer in the same language the user asked in (Hindi or English).";

const AI_CACHE_COLLECTION = "cached_responses";

/**
 * Normalize a prompt into a stable Firestore doc ID.
 * Handles Hindi (non-ASCII) correctly via an MD5 hash — purely ASCII slugs
 * would collapse all Hindi questions into the same cache key.
 */
function normalizePrompt(rawPrompt) {
  const cleaned = rawPrompt.trim().toLowerCase();
  const slug = cleaned
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const hash = crypto.createHash("md5").update(cleaned).digest("hex").slice(0, 10);
  return slug ? `${slug}_${hash}` : hash;
}

async function askGemini(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.models.generateContent({
    model:    "gemini-2.5-flash",
    contents: prompt,
    config:   { systemInstruction: AI_SYSTEM_PROMPT },
  });
  const text = result.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function askGroq(prompt) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model:    "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user",   content: prompt },
    ],
  });
  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty response");
  return text;
}

async function askHuggingFace(prompt) {
  const hf = new InferenceClient(process.env.HF_TOKEN);
  const completion = await hf.chatCompletion({
    model:     "meta-llama/Llama-3.1-8B-Instruct",
    messages:  [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user",   content: prompt },
    ],
    max_tokens: 512,
  });
  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Hugging Face returned an empty response");
  return text;
}

exports.askHealthAssistant = onCall(
  { secrets: [GEMINI_API_KEY, GROQ_API_KEY, HF_TOKEN] },
  async (request) => {
    // Uncomment to require login before spending AI credits:
    // assertRole(request, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA, ROLES.PATIENT);

    const userPrompt = (request.data?.prompt || "").trim();
    if (!userPrompt) {
      throw new HttpsError("invalid-argument", 'Please send a non-empty "prompt".');
    }

    const cacheId  = normalizePrompt(userPrompt);
    const cacheRef = db.collection(AI_CACHE_COLLECTION).doc(cacheId);

    // ── Cache check ────────────────────────────────────────────────────────
    try {
      const snap = await cacheRef.get();
      if (snap.exists) {
        return { response: snap.data().response, source: "cache" };
      }
    } catch (err) {
      logger.warn("Cache read failed — continuing to live AI call:", err.message);
    }

    // ── Gemini → Groq → Hugging Face fallback chain ────────────────────────
    let responseText = null;
    let source       = null;

    try {
      responseText = await askGemini(userPrompt);
      source       = "gemini";
    } catch (e) {
      logger.warn("Gemini failed:", e.message);
      try {
        responseText = await askGroq(userPrompt);
        source       = "groq";
      } catch (e2) {
        logger.warn("Groq failed:", e2.message);
        try {
          responseText = await askHuggingFace(userPrompt);
          source       = "huggingface";
        } catch (e3) {
          logger.error("All 3 AI providers failed:", e3.message);
          throw new HttpsError(
            "unavailable",
            "Asha AI couldn't reach any provider right now. Please try again shortly."
          );
        }
      }
    }

    // ── Save to cache (best-effort — never blocks the response) ───────────
    try {
      await cacheRef.set({
        response:      responseText,
        provider:      source,
        originalPrompt: userPrompt,
        createdAt:     FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.warn("Cache write failed (response still returned):", err.message);
    }

    return { response: responseText, source };
  }
);
