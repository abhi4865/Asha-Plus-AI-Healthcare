"use strict";

/**
 * ============================================================================
 *  Asha Plus — Vercel Serverless Backend
 *  Converted from Firebase Cloud Functions → Express on Vercel
 *
 *  All 15 original functions preserved:
 *  initializeAdmin, createUser, updateUserRole, deleteAuthUser, listUsers,
 *  addPatient, updatePatient, deletePatient, addVisit, updateVisit,
 *  deleteVisit, addScheme, updateScheme, deleteScheme, askHealthAssistant
 * ============================================================================
 */

const express         = require("express");
const cors            = require("cors");
const crypto          = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth }     = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const Groq            = require("groq-sdk");
const { InferenceClient } = require("@huggingface/inference");

// ── Firebase Admin init (safe for serverless — only runs once per cold start) ─
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const db   = getFirestore();
const auth = getAuth();

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ── Role constants ────────────────────────────────────────────────────────────
const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN:       "admin",
  ASHA:        "asha",
  PATIENT:     "patient",
};

const COL = {
  USERS:    "users",
  PATIENTS: "patients",
  SCHEMES:  "govt_schemes",
  CACHE:    "cached_responses",
};

// =============================================================================
//  SHARED HELPERS
// =============================================================================

/** Verify Firebase ID token from Authorization: Bearer <token> header */
async function verifyToken(req) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await auth.verifyIdToken(token);
  } catch {
    return null;
  }
}

/** Returns an error object if caller lacks the required role, null if OK */
function checkRole(decoded, ...allowedRoles) {
  if (!decoded) {
    return { code: 401, message: "You must be signed in to do this." };
  }
  if (!allowedRoles.includes(decoded.role)) {
    return {
      code: 403,
      message: `Required role: ${allowedRoles.join(" or ")}. Your role: ${decoded.role || "none"}.`,
    };
  }
  return null;
}

/** Returns an error object if a required field is missing, null if OK */
function checkField(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return { code: 400, message: `"${fieldName}" is required.` };
  }
  return null;
}

/** Map internal error codes to HTTP status codes and send response */
function sendError(res, err) {
  if (err && err.code && err.message) {
    // Already formatted
    return res.status(err.code).json({ error: err.message });
  }
  // Unexpected error
  return res.status(500).json({ error: err?.message || "Internal server error." });
}

// =============================================================================
//  1. INITIALIZE ADMIN  (POST /api/initializeAdmin)
//  Called once via curl/Postman to bootstrap the first super_admin.
// =============================================================================
app.post("/api/initializeAdmin", async (req, res) => {
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

    return res.status(201).json({
      success: true,
      message: "✅ Super admin created. You can now log in via the app.",
      uid:     userRecord.uid,
    });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      return res.status(409).json({ error: "This email is already registered in Firebase Auth." });
    }
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================================
//  2. CREATE USER  (POST /api/createUser)
//  admin or super_admin creates asha / patient / admin accounts.
// =============================================================================
app.post("/api/createUser", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { email, password, name, role, mobile = "", location = "" } = req.body || {};

  const fieldErr =
    checkField(email,    "email")    ||
    checkField(password, "password") ||
    checkField(name,     "name")     ||
    checkField(role,     "role");
  if (fieldErr) return sendError(res, fieldErr);

  if (password.length < 8) {
    return sendError(res, { code: 400, message: "Password must be at least 8 characters." });
  }

  const creatableRoles = decoded.role === ROLES.SUPER_ADMIN
    ? [ROLES.ADMIN, ROLES.ASHA, ROLES.PATIENT]
    : [ROLES.ASHA, ROLES.PATIENT];

  if (!creatableRoles.includes(role)) {
    return sendError(res, {
      code:    403,
      message: `You cannot create a user with role "${role}". Allowed: ${creatableRoles.join(", ")}.`,
    });
  }

  try {
    const userRecord = await auth.createUser({ email, password, displayName: name });
    await auth.setCustomUserClaims(userRecord.uid, { role });

    const profile = {
      uid:       userRecord.uid,
      name,
      email,
      role,
      mobile,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: decoded.uid,
    };
    if (role === ROLES.ASHA) {
      profile.location = location;
      profile.id       = `ASHA-${userRecord.uid.slice(0, 6).toUpperCase()}`;
    }
    if (role === ROLES.PATIENT) {
      profile.id = `P-${userRecord.uid.slice(0, 6).toUpperCase()}`;
    }

    await db.collection(COL.USERS).doc(userRecord.uid).set(profile);
    return res.json({ success: true, uid: userRecord.uid, message: `${role} account created successfully.` });
  } catch (err) {
    if (err.code === "auth/email-already-exists") return sendError(res, { code: 409, message: "This email is already registered." });
    if (err.code === "auth/invalid-email")        return sendError(res, { code: 400, message: "Invalid email address." });
    return sendError(res, { code: 500, message: "Failed to create user: " + err.message });
  }
});

// =============================================================================
//  3. UPDATE USER ROLE  (POST /api/updateUserRole)
//  super_admin only.
// =============================================================================
app.post("/api/updateUserRole", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { uid, newRole } = req.body || {};
  const fieldErr = checkField(uid, "uid") || checkField(newRole, "newRole");
  if (fieldErr) return sendError(res, fieldErr);

  if (!Object.values(ROLES).includes(newRole)) {
    return sendError(res, { code: 400, message: `Invalid role: "${newRole}". Valid: ${Object.values(ROLES).join(", ")}.` });
  }
  if (uid === decoded.uid) {
    return sendError(res, { code: 400, message: "You cannot change your own role." });
  }

  try {
    await auth.setCustomUserClaims(uid, { role: newRole });
    await db.collection(COL.USERS).doc(uid).update({
      role:      newRole,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decoded.uid,
    });
    return res.json({ success: true, message: `Role updated to "${newRole}".` });
  } catch (err) {
    return sendError(res, { code: 500, message: err.message });
  }
});

// =============================================================================
//  4. DELETE AUTH USER  (POST /api/deleteAuthUser)
//  admin or super_admin.
// =============================================================================
app.post("/api/deleteAuthUser", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { uid } = req.body || {};
  const fieldErr = checkField(uid, "uid");
  if (fieldErr) return sendError(res, fieldErr);

  if (uid === decoded.uid) {
    return sendError(res, { code: 400, message: "You cannot delete your own account." });
  }

  const target = await db.collection(COL.USERS).doc(uid).get();
  if (target.exists && target.data().role === ROLES.SUPER_ADMIN) {
    return sendError(res, { code: 403, message: "Super admin accounts cannot be deleted." });
  }

  try {
    await auth.deleteUser(uid);
    await db.collection(COL.USERS).doc(uid).delete();
    return res.json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    return sendError(res, { code: 500, message: err.message });
  }
});

// =============================================================================
//  5. LIST USERS  (POST /api/listUsers)
//  admin or super_admin.
// =============================================================================
app.post("/api/listUsers", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  try {
    const snap  = await db.collection(COL.USERS).orderBy("createdAt", "desc").get();
    const users = snap.docs.map((doc) => {
      const { password: _pw, ...safe } = doc.data();
      return safe;
    });
    return res.json({ users });
  } catch (err) {
    return sendError(res, { code: 500, message: err.message });
  }
});

// =============================================================================
//  6. PATIENT CRUD
// =============================================================================

async function nextPatientId() {
  const snap = await db.collection(COL.PATIENTS).count().get();
  const n    = (snap.data().count || 0) + 1;
  return `P${String(n).padStart(3, "0")}`;
}

// POST /api/addPatient
app.post("/api/addPatient", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const d        = req.body || {};
  const fieldErr = checkField(d.name, "name") || checkField(d.mobile, "mobile");
  if (fieldErr) return sendError(res, fieldErr);

  const patientId = await nextPatientId();
  const patient   = {
    id:         patientId,
    name:       d.name.trim(),
    age:        d.age      || "",
    gender:     d.gender   || "",
    blood:      d.blood    || "",
    mobile:     d.mobile.trim(),
    email:      d.email    || "",
    village:    d.village  || "",
    state:      d.state    || "",
    diseases:   d.diseases || "None",
    registered: new Date().toISOString().split("T")[0],
    createdAt:  FieldValue.serverTimestamp(),
    createdBy:  decoded.uid,
  };

  await db.collection(COL.PATIENTS).doc(patientId).set(patient);
  return res.json({ success: true, patientId, patient });
});

// POST /api/updatePatient
app.post("/api/updatePatient", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const { patientId, updates } = req.body || {};
  const fieldErr = checkField(patientId, "patientId") || checkField(updates, "updates");
  if (fieldErr) return sendError(res, fieldErr);

  const EDITABLE = ["name", "age", "gender", "blood", "mobile", "email", "village", "state", "diseases"];
  const safe     = {};
  EDITABLE.forEach((k) => { if (updates[k] !== undefined) safe[k] = updates[k]; });
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = decoded.uid;

  if (Object.keys(safe).length <= 2) {
    return sendError(res, { code: 400, message: "No valid fields provided to update." });
  }

  await db.collection(COL.PATIENTS).doc(patientId).update(safe);
  return res.json({ success: true });
});

// POST /api/deletePatient
app.post("/api/deletePatient", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { patientId } = req.body || {};
  const fieldErr      = checkField(patientId, "patientId");
  if (fieldErr) return sendError(res, fieldErr);

  const visitsSnap = await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").get();

  const batch = db.batch();
  visitsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection(COL.PATIENTS).doc(patientId));
  await batch.commit();

  return res.json({ success: true });
});

// =============================================================================
//  7. VISIT HISTORY CRUD
// =============================================================================

// POST /api/addVisit
app.post("/api/addVisit", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const { patientId, visit } = req.body || {};
  const fieldErr = checkField(patientId, "patientId") || checkField(visit, "visit");
  if (fieldErr) return sendError(res, fieldErr);

  const visitRef  = db.collection(COL.PATIENTS).doc(patientId).collection("visits").doc();
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
    createdBy:   decoded.uid,
  };

  await visitRef.set(visitData);
  return res.json({ success: true, visitId: visitRef.id });
});

// POST /api/updateVisit
app.post("/api/updateVisit", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const { patientId, visitId, updates } = req.body || {};
  const fieldErr =
    checkField(patientId, "patientId") ||
    checkField(visitId,   "visitId")   ||
    checkField(updates,   "updates");
  if (fieldErr) return sendError(res, fieldErr);

  const { id: _id, createdAt: _ca, createdBy: _cb, ...safe } = updates;
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = decoded.uid;

  await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").doc(visitId)
    .update(safe);

  return res.json({ success: true });
});

// POST /api/deleteVisit
app.post("/api/deleteVisit", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const { patientId, visitId } = req.body || {};
  const fieldErr = checkField(patientId, "patientId") || checkField(visitId, "visitId");
  if (fieldErr) return sendError(res, fieldErr);

  await db
    .collection(COL.PATIENTS).doc(patientId)
    .collection("visits").doc(visitId)
    .delete();

  return res.json({ success: true });
});

// =============================================================================
//  8. GOVERNMENT SCHEMES CRUD
// =============================================================================

// POST /api/addScheme
app.post("/api/addScheme", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const d        = req.body || {};
  const fieldErr = checkField(d.title, "title");
  if (fieldErr) return sendError(res, fieldErr);

  const schemeRef = db.collection(COL.SCHEMES).doc();
  await schemeRef.set({
    id:          schemeRef.id,
    title:       d.title       || "",
    titleHi:     d.titleHi     || "",
    category:    d.category    || "",
    description: d.description || "",
    descHi:      d.descHi      || "",
    eligibility: d.eligibility || [],
    eligHi:      d.eligHi      || [],
    benefits:    d.benefits    || [],
    benefitsHi:  d.benefitsHi  || [],
    applyUrl:    d.applyUrl    || "",
    createdAt:   FieldValue.serverTimestamp(),
    createdBy:   decoded.uid,
  });

  return res.json({ success: true, schemeId: schemeRef.id });
});

// POST /api/updateScheme
app.post("/api/updateScheme", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { schemeId, updates } = req.body || {};
  const fieldErr = checkField(schemeId, "schemeId") || checkField(updates, "updates");
  if (fieldErr) return sendError(res, fieldErr);

  const { id: _id, createdAt: _ca, createdBy: _cb, ...safe } = updates;
  safe.updatedAt = FieldValue.serverTimestamp();
  safe.updatedBy = decoded.uid;

  await db.collection(COL.SCHEMES).doc(schemeId).update(safe);
  return res.json({ success: true });
});

// POST /api/deleteScheme
app.post("/api/deleteScheme", async (req, res) => {
  const decoded = await verifyToken(req);
  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN);
  if (authErr) return sendError(res, authErr);

  const { schemeId } = req.body || {};
  const fieldErr     = checkField(schemeId, "schemeId");
  if (fieldErr) return sendError(res, fieldErr);

  await db.collection(COL.SCHEMES).doc(schemeId).delete();
  return res.json({ success: true });
});

// =============================================================================
//  9. ASHA AI HEALTH ASSISTANT  (POST /api/askHealthAssistant)
//  10. MEDICAL DOCUMENT ANALYSIS (POST /api/analyzeMedicalDocument)
//  Both share one cache-first, 3-provider fallback chain — all free tiers:
//  Gemini → Groq → HuggingFace
// =============================================================================

const AI_SYSTEM_PROMPT =
  "You are Asha AI, a helpful health assistant built into a healthcare app " +
  "used by ASHA workers and patients across rural India. Provide brief, " +
  "accurate, compassionate health information. Always advise the user to " +
  "consult a real doctor for serious or persistent issues. " +
  "Answer in the same language the user asked in (Hindi or English).";

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

/** md5 of arbitrary text — used to build cache keys for document analysis */
function hashOf(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

// ── Provider callers — every one takes (systemPrompt, userPrompt) and ───────
// returns plain response text, or throws if that provider failed.

async function callGemini(systemPrompt, userPrompt) {
  const ai     = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.models.generateContent({
    model:    "gemini-2.5-flash",
    contents: userPrompt,
    config:   { systemInstruction: systemPrompt },
  });
  const text = result.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function callGroq(systemPrompt, userPrompt) {
  const groq       = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model:    "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });
  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty response");
  return text;
}

async function callHuggingFace(systemPrompt, userPrompt) {
  const hf         = new InferenceClient(process.env.HF_TOKEN);
  const completion = await hf.chatCompletion({
    model:      "meta-llama/Llama-3.1-8B-Instruct",
    messages:   [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 512,
  });
  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Hugging Face returned an empty response");
  return text;
}

// ── The fallback chain itself — reorder this array to change priority ───────
const PROVIDER_CHAIN = [
  { name: "gemini",      envKey: "GEMINI_API_KEY",    call: callGemini },
  { name: "groq",        envKey: "GROQ_API_KEY",      call: callGroq },
  { name: "huggingface", envKey: "HF_TOKEN",          call: callHuggingFace },
];

/**
 * Tries every configured provider in PROVIDER_CHAIN order.
 * Skips providers whose env var isn't set (instead of failing on them),
 * so this works even with only 1 of the 4 keys configured.
 * Returns { text, source }. Throws only if every configured provider failed.
 */
async function runWithFallback(systemPrompt, userPrompt) {
  let lastErr = null;
  let triedAny = false;

  for (const provider of PROVIDER_CHAIN) {
    if (!process.env[provider.envKey]) {
      continue; // key not configured — skip silently, don't waste a call
    }
    triedAny = true;
    try {
      const text = await provider.call(systemPrompt, userPrompt);
      return { text, source: provider.name };
    } catch (err) {
      console.warn(`${provider.name} failed:`, err.message);
      lastErr = err;
    }
  }

  if (!triedAny) {
    throw new Error(
      "No AI provider API keys are configured on the server (checked GEMINI_API_KEY, GROQ_API_KEY, HF_TOKEN)."
    );
  }
  throw lastErr || new Error("All configured AI providers failed.");
}

app.post("/api/askHealthAssistant", async (req, res) => {
  const userPrompt = (req.body?.prompt || "").trim();
  if (!userPrompt) {
    return sendError(res, { code: 400, message: 'Please send a non-empty "prompt".' });
  }

  const cacheId  = normalizePrompt(userPrompt);
  const cacheRef = db.collection(COL.CACHE).doc(cacheId);

  // ── Cache check ────────────────────────────────────────────────────────────
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      return res.json({ response: snap.data().response, source: "cache" });
    }
  } catch (err) {
    console.warn("Cache read failed — continuing to live AI call:", err.message);
  }

  // ── Gemini → Groq → HuggingFace fallback chain ──────────────────────────
  let result;
  try {
    result = await runWithFallback(AI_SYSTEM_PROMPT, userPrompt);
  } catch (e) {
    console.error("All AI providers failed:", e.message);
    return sendError(res, {
      code:    503,
      message: "Asha AI couldn't reach any provider right now. Please try again shortly.",
    });
  }

  // ── Save to cache (best-effort — never blocks the response) ───────────────
  try {
    await cacheRef.set({
      response:       result.text,
      provider:       result.source,
      originalPrompt: userPrompt,
      createdAt:      FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("Cache write failed (response still returned):", err.message);
  }

  return res.json({ response: result.text, source: result.source });
});

app.post("/api/analyzeMedicalDocument", async (req, res) => {
  const systemPrompt = (req.body?.systemPrompt || "").trim();
  const ocrText      = (req.body?.ocrText || "").trim();

  if (!systemPrompt || !ocrText) {
    return sendError(res, {
      code:    400,
      message: 'Please send a non-empty "systemPrompt" and "ocrText".',
    });
  }

  const userPrompt =
    `Here is the OCR-extracted text from the uploaded image. Analyze it and ` +
    `reply using the required structure only — no extra commentary:\n\n"""\n${ocrText}\n"""`;

  // Cache by (systemPrompt + ocrText) so re-analyzing the same document
  // (e.g. after a retry) doesn't spend a second AI call.
  const cacheId  = "doc_" + hashOf(systemPrompt + "::" + ocrText);
  const cacheRef = db.collection(COL.CACHE).doc(cacheId);

  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      return res.json({ response: snap.data().response, source: "cache" });
    }
  } catch (err) {
    console.warn("Cache read failed — continuing to live AI call:", err.message);
  }

  let result;
  try {
    result = await runWithFallback(systemPrompt, userPrompt);
  } catch (e) {
    console.error("All AI providers failed for document analysis:", e.message);
    return sendError(res, {
      code:    503,
      message: "AI analysis couldn't reach any provider right now. Please try again shortly.",
    });
  }

  try {
    await cacheRef.set({
      response:  result.text,
      provider:  result.source,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("Cache write failed (response still returned):", err.message);
  }

  return res.json({ response: result.text, source: result.source });
});

// =============================================================================
//  10. SELF-REGISTER PATIENT  (POST /api/selfRegisterPatient)
//  Called immediately after Firebase Auth signup on the client.
//  Uses the new user's own ID token — no staff role required.
//  Atomically creates both the `patients` doc and the `users` doc.
// =============================================================================
app.post("/api/selfRegisterPatient", async (req, res) => {
  // Any valid Firebase token is accepted here — the caller just signed up
  const decoded = await verifyToken(req);
  if (!decoded) {
    return sendError(res, { code: 401, message: "Authentication required. Please try again." });
  }

  const { name, email } = req.body || {};
  const fieldErr = checkField(name, "name") || checkField(email, "email");
  if (fieldErr) return sendError(res, fieldErr);

  const uid = decoded.uid;

  // Guard: don't double-create if called twice
  const existingUser = await db.collection(COL.USERS).doc(uid).get();
  if (existingUser.exists) {
    const existing = existingUser.data();
    return res.json({ success: true, patientId: existing.patientId, alreadyExists: true });
  }

  try {
    const patientId = await nextPatientId();
    const now       = new Date().toISOString().split("T")[0];

    const patientDoc = {
      id:         patientId,
      name:       name.trim(),
      email:      email.trim().toLowerCase(),
      age:        "",
      gender:     "",
      blood:      "",
      mobile:     "",
      village:    "",
      state:      "",
      diseases:   "None",
      registered: now,
      createdAt:  FieldValue.serverTimestamp(),
      createdBy:  "self_registration",
    };

    const userDoc = {
      uid,
      name:      name.trim(),
      email:     email.trim().toLowerCase(),
      role:      ROLES.PATIENT,
      patientId,                           // links auth user → patient record
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "self_registration",
    };

    // Atomic write — both succeed or both fail
    const batch = db.batch();
    batch.set(db.collection(COL.PATIENTS).doc(patientId), patientDoc);
    batch.set(db.collection(COL.USERS).doc(uid), userDoc);
    await batch.commit();

    // Set custom claims so role-check works after next token refresh
    await auth.setCustomUserClaims(uid, { role: ROLES.PATIENT });

    return res.json({ success: true, patientId });
  } catch (err) {
    return sendError(res, { code: 500, message: "Registration failed: " + err.message });
  }
});

// ── Export for Vercel ─────────────────────────────────────────────────────────
// =============================================================================
//  11. ADMIN CREATE PATIENT  (POST /api/adminCreatePatient)
//  Admin / ASHA creates a full patient profile AND optionally a login account.
//  If email + password supplied → Firebase Auth user + users doc + patients doc.
//  If no password → patients doc only (same as addPatient).
// =============================================================================
app.post("/api/adminCreatePatient", async (req, res) => {
  const decoded  = await verifyToken(req);
  if (!decoded) return sendError(res, { code: 401, message: "Authentication required." });

  const authErr = checkRole(decoded, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ASHA);
  if (authErr) return sendError(res, authErr);

  const { name, email, password, mobile, age, gender, blood,
          village, state, diseases, allergies, medications,
          emergencyName, emergencyNumber, registered } = req.body || {};

  const fieldErr = checkField(name, "name");
  if (fieldErr) return sendError(res, fieldErr);

  try {
    const patientId = await nextPatientId();
    const today     = registered || new Date().toISOString().split("T")[0];

    const patientDoc = {
      id:               patientId,
      name:             (name  || "").trim(),
      email:            (email || "").trim().toLowerCase(),
      mobile:           mobile  || "",
      age:              Number(age) || 0,
      gender:           gender  || "",
      blood:            blood   || "",
      village:          village || "",
      state:            state   || "",
      diseases:         diseases   || "None",
      allergies:        allergies  || "",
      medications:      medications || "",
      emergencyName:    emergencyName   || "",
      emergencyNumber:  emergencyNumber || "",
      registered:       today,
      createdAt:        FieldValue.serverTimestamp(),
      createdBy:        decoded.uid,
    };

    if (email && password) {
      // ── Create Firebase Auth user + users doc + patients doc atomically ──
      const userRecord = await auth.createUser({ email: email.trim(), password, displayName: name.trim() });
      await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.PATIENT });

      const userDoc = {
        uid:       userRecord.uid,
        name:      (name  || "").trim(),
        email:     (email || "").trim().toLowerCase(),
        role:      ROLES.PATIENT,
        patientId,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: decoded.uid,
      };

      const batch = db.batch();
      batch.set(db.collection(COL.PATIENTS).doc(patientId), patientDoc);
      batch.set(db.collection(COL.USERS).doc(userRecord.uid), userDoc);
      await batch.commit();

      return res.json({ success: true, patientId, uid: userRecord.uid, loginCreated: true });
    } else {
      // ── No login — just create the patient record ──
      await db.collection(COL.PATIENTS).doc(patientId).set(patientDoc);
      return res.json({ success: true, patientId, loginCreated: false });
    }
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      return sendError(res, { code: 409, message: "A login account with this email already exists." });
    }
    return sendError(res, { code: 500, message: "Failed to create patient: " + err.message });
  }
});

module.exports = app;