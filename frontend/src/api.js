/**
 * ============================================================================
 *  Asha Plus — Vercel API Client
 *  All backend calls go through here. Auth token is automatically attached.
 * ============================================================================
 */

import { auth } from "./firebaseConfig";

const BASE_URL = "https://asha-care-eight.vercel.app";

// ── Core fetch helper — attaches Firebase ID token automatically ─────────────
async function apiFetch(endpoint, body) {
  const token = await auth.currentUser?.getIdToken();
  const res   = await fetch(`${BASE_URL}${endpoint}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Auth & User Management ────────────────────────────────────────────────────

export const createUser = (payload) =>
  apiFetch("/api/createUser", payload);
  // payload: { email, password, name, role, mobile?, location? }

export const updateUserRole = (uid, newRole) =>
  apiFetch("/api/updateUserRole", { uid, newRole });

export const deleteAuthUser = (uid) =>
  apiFetch("/api/deleteAuthUser", { uid });

export const listUsers = () =>
  apiFetch("/api/listUsers", {});

// ── Patients ─────────────────────────────────────────────────────────────────

export const addPatient = (patient) =>
  apiFetch("/api/addPatient", patient);
  // patient: { name, mobile, age?, gender?, blood?, email?, village?, state?, diseases? }

export const updatePatient = (patientId, updates) =>
  apiFetch("/api/updatePatient", { patientId, updates });

export const deletePatient = (patientId) =>
  apiFetch("/api/deletePatient", { patientId });

// ── Visit History ─────────────────────────────────────────────────────────────

export const addVisit = (patientId, visit) =>
  apiFetch("/api/addVisit", { patientId, visit });

export const updateVisit = (patientId, visitId, updates) =>
  apiFetch("/api/updateVisit", { patientId, visitId, updates });

export const deleteVisit = (patientId, visitId) =>
  apiFetch("/api/deleteVisit", { patientId, visitId });

// ── Government Schemes ────────────────────────────────────────────────────────

export const addScheme = (scheme) =>
  apiFetch("/api/addScheme", scheme);

export const updateScheme = (schemeId, updates) =>
  apiFetch("/api/updateScheme", { schemeId, updates });

export const deleteScheme = (schemeId) =>
  apiFetch("/api/deleteScheme", { schemeId });

// ── AI Health Assistant ───────────────────────────────────────────────────────

export const askHealthAssistant = (prompt) =>
  apiFetch("/api/askHealthAssistant", { prompt });
  // returns: { response: string, source: "gemini"|"groq"|"huggingface"|"cache" }
