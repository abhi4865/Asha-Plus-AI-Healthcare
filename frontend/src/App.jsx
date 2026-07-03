import { useState, useEffect, createContext, useContext, useRef } from "react";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import {
  addPatient,
  updatePatient,
  deletePatient,
  askHealthAssistant,
  analyzeMedicalDocument,
  selfRegisterPatient,
  adminCreatePatient,
  createUser,
  deleteAuthUser,
} from "./api";
import "./App.css";

// ─── Login illustration (base64 so the component stays self-contained) ──────
const WOMEN_ILLUSTRATION = "/illustration.jpg";

// ─── Auth Context ────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ─── Security / Password Config (still used by Manage Admin Profile UI) ─────
const SECURITY_QUESTIONS = [
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "Which ASHA center did you start your career at?",
];

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS  = 15 * 60 * 1000; // 15 minutes

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", cls: "weak", pct: 25 };
  if (score <= 3) return { label: "Medium", cls: "medium", pct: 60 };
  return { label: "Strong", cls: "strong", pct: 100 };
}

// ─── Icons (emoji-based, no deps) ────────────────────────────────────────────
const Icon = ({ e, size }) => (
  <span style={{ fontSize: size || 16, lineHeight: 1 }}>{e}</span>
);

// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({ toasts, dismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
          <Icon e={t.type === "success" ? "✅" : t.type === "error" ? "❌" : "⚠️"} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
            {t.msg && <div style={{ fontSize: 12, color: "#6B7280" }}>{t.msg}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (title, type = "success", msg = "") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, title, type, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };
  const dismiss = (id) => setToasts((p) => p.filter((t) => t.id !== id));
  return { toasts, add, dismiss };
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin, onLoginStart, onLoginEnd }) {
  const [role, setRole]       = useState("admin");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showPass, setShowP]  = useState(false);
  const [showForgotMsg, setShowForgotMsg] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regShowPass, setRegShowPass] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regStatus, setRegStatus] = useState("");
  const [regError, setRegError] = useState("");

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Signal to onAuthStateChanged that a manual login is in progress
      onLoginStart?.();

      // 1. Sign in with Firebase Auth
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      // 2. Force token refresh so custom claims (role) are included
      await cred.user.getIdToken(true);

      // 3. Fetch the user profile from Firestore
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists()) {
        throw new Error("User profile not found. Contact your administrator.");
      }

      const profile = snap.data();

      // 4. Verify the selected login-type matches the actual Firestore role.
      //    "admin" dropdown covers both admin and super_admin.
      const roleMap = {
        admin:   ["admin", "super_admin"],
        asha:    ["asha"],
        patient: ["patient"],
      };
      const allowedRoles = roleMap[role] ?? [role];
      if (!allowedRoles.includes(profile.role)) {
        await signOut(auth);
        const labelMap = { admin: "Admin", asha: "ASHA Worker", patient: "Patient" };
        throw new Error(
          `This account is not an ${labelMap[role] ?? role}. Please select the correct login type.`
        );
      }

      // 5. Hand the full profile to App so it sets the user state
      onLogin(profile);
    } catch (err) {
      // Convert Firebase error codes to friendly messages
      const msg = err.message || "";
      if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found")) {
        setError("Incorrect email or password.");
      } else if (msg.includes("auth/too-many-requests")) {
        setError("Too many failed attempts. Try again later.");
      } else if (msg.includes("auth/user-disabled")) {
        setError("This account has been disabled. Contact your administrator.");
      } else {
        setError(msg.replace("Firebase: ", "").replace(/\s*\(auth\/[^)]+\)/, "").trim());
      }
    } finally {
      onLoginEnd?.(); // always reset the manual-login flag
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError("");
    if (!regName.trim() || !regEmail.trim() || !regPassword || !regConfirm) {
      setRegError("Please fill in all fields.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("Passwords do not match.");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("Password must be at least 8 characters.");
      return;
    }
    setRegLoading(true);
    setRegStatus("");
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        regEmail.trim(),
        regPassword
      );

      // 2. Get the fresh ID token immediately (before auth state propagates)
      const idToken = await cred.user.getIdToken();

      // 3. Call backend — atomically creates users doc + patients doc
      //    Returns { patientId } e.g. "P001"
      const result = await selfRegisterPatient(idToken, {
        name:  regName.trim(),
        email: regEmail.trim().toLowerCase(),
      });

      setRegStatus(
        `✅ Account created! Your Patient ID is ${result.patientId}. You can now log in.`
      );

      // 4. Sign out so the login page starts fresh (custom claims need a token refresh)
      await signOut(auth);

      // Auto-switch back to login after 2s
      setTimeout(() => {
        setShowRegister(false);
        setEmail(regEmail.trim());
      }, 2000);
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("auth/email-already-in-use")) {
        setRegError("This email is already registered. Please log in.");
      } else if (msg.includes("auth/invalid-email")) {
        setRegError("Please enter a valid email address.");
      } else if (msg.includes("auth/weak-password")) {
        setRegError("Password is too weak. Use at least 8 characters.");
      } else {
        setRegError(msg.replace("Firebase: ", "").replace(/\s*\(auth\/[^)]+\)/, "").trim());
      }
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ── Left Panel – Illustration ── */}
      <div className="login-left">
        <div className="login-illustration-card">
          <img
            className="login-illustration-img"
            src={WOMEN_ILLUSTRATION}
            alt="ASHA workers visiting a family in their community"
          />
        </div>
        <div className="login-left-tagline">
          <span>Empowering</span> ASHA Workers &amp; Communities
        </div>
      </div>

      {/* ── Right Panel – Form ── */}
      <div className="login-right">
        <div className="login-form-panel">
          {/* Brand */}
          <div className="login-brand">
            <div className="login-brand-title">Asha<span>+</span></div>
          </div>

          {!showRegister ? (
            <>
              <div className="login-subtitle">Login with your email and password</div>

              <form onSubmit={handleSubmit} style={{ width: "100%" }}>
                {/* Role dropdown */}
                <div className="login-field">
                  <select
                    className="login-select"
                    value={role}
                    onChange={(e) => { setRole(e.target.value); setError(""); }}
                  >
                    <option value="admin">Login as Admin</option>
                    <option value="asha">Login as ASHA Worker</option>
                    <option value="patient">Login as Patient</option>
                  </select>
                  <span className="login-select-arrow">▾</span>
                </div>

                {/* Email */}
                <div className="login-field">
                  <input
                    className="login-input"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {/* Password */}
                <div className="login-field" style={{ position: "relative" }}>
                  <input
                    className="login-input"
                    type={showPass ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPass(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowP((p) => !p)}
                    style={{
                      position: "absolute", right: 16, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      cursor: "pointer", fontSize: 16, color: "rgba(109,40,217,0.5)",
                    }}
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>

                {/* Forgot password */}
                <div style={{ textAlign: "right", marginBottom: showForgotMsg ? 10 : 20 }}>
                  <span
                    className="login-link"
                    onClick={() => setShowForgotMsg((p) => !p)}
                  >
                    Forgot Password?
                  </span>
                </div>

                {/* Forgot password placeholder — pending Firebase Auth wiring */}
                {showForgotMsg && (
                  <div className="login-demo-creds" style={{ marginBottom: 20 }}>
                    Password reset isn't available yet. This will be enabled once
                    Firebase Authentication &amp; Firestore are connected in an
                    upcoming update. Please contact your administrator for now.
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="login-error">{error}</div>
                )}

                {/* Login button */}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={loading}
                >
                  {loading ? <span className="spinner" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} /> : null}
                  {loading ? "Signing in…" : "Login"}
                </button>
              </form>

              {/* Register link */}
              <div className="login-register-row">
                Don't have an account?{" "}
                <span
                  className="login-register-link"
                  onClick={() => { setShowRegister(true); setRegStatus(""); setRegError(""); }}
                >
                  Register
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="login-subtitle">Create a new account</div>

              <form onSubmit={handleRegisterSubmit} style={{ width: "100%" }}>
                {/* Name */}
                <div className="login-field">
                  <input
                    className="login-input"
                    type="text"
                    placeholder="Full Name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                  />
                </div>

                {/* Email */}
                <div className="login-field">
                  <input
                    className="login-input"
                    type="email"
                    placeholder="Email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                  />
                </div>

                {/* Password */}
                <div className="login-field" style={{ position: "relative" }}>
                  <input
                    className="login-input"
                    type={regShowPass ? "text" : "password"}
                    placeholder="Password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setRegShowPass((p) => !p)}
                    style={{
                      position: "absolute", right: 16, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      cursor: "pointer", fontSize: 16, color: "rgba(109,40,217,0.5)",
                    }}
                  >
                    {regShowPass ? "🙈" : "👁️"}
                  </button>
                </div>

                {/* Confirm Password */}
                <div className="login-field" style={{ marginBottom: 20 }}>
                  <input
                    className="login-input"
                    type={regShowPass ? "text" : "password"}
                    placeholder="Confirm Password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    required
                  />
                </div>

                {/* Pending backend connection notice */}
                {regStatus && (
                  <div className="login-demo-creds" style={{ marginBottom: 20 }}>
                    {regStatus}
                  </div>
                )}

                {/* Error */}
                {regError && (
                  <div className="login-error">{regError}</div>
                )}

                {/* Register button */}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={regLoading}
                >
                  {regLoading ? <span className="spinner" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} /> : null}
                  {regLoading ? "Connecting…" : "Register"}
                </button>
              </form>

              {/* Back to login */}
              <div className="login-register-row">
                Already have an account?{" "}
                <span
                  className="login-register-link"
                  onClick={() => { setShowRegister(false); setRegStatus(""); setRegError(""); }}
                >
                  Login
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
// Custom clipboard logo used for "Medical Analysis" — rendered inline so it
// stays crisp at any size and needs no extra image file/request.
function ClipboardLogoIcon({ size = 20, style }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      <rect x="12" y="14" width="40" height="46" rx="4" fill="#d2a679" stroke="#231f20" strokeWidth="2" strokeLinejoin="round" />
      <rect x="18" y="24" width="28" height="32" fill="#ffffff" stroke="#231f20" strokeWidth="2" strokeLinejoin="round" />
      <line x1="23" y1="30" x2="41" y2="30" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <line x1="23" y1="36" x2="41" y2="36" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <line x1="23" y1="42" x2="41" y2="42" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <line x1="23" y1="48" x2="31" y2="48" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <rect x="22" y="10" width="20" height="12" rx="2" fill="#e6e6e6" stroke="#231f20" strokeWidth="2" strokeLinejoin="round" />
      <path d="M 28 10 V 6 C 28 3 36 3 36 6 V 10" fill="none" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="16" r="1.5" fill="#231f20" />
    </svg>
  );
}

const ADMIN_NAV = [
  { key: "dashboard", icon: "📊", label: "Dashboard" },
  { key: "patients",  icon: "👥", label: "All Patients" },
  { key: "register",  icon: "➕", label: "Register Patient" },
  { key: "chatbot",   icon: "🤖", label: "AI Assistant" },
  { key: "medical",   icon: <ClipboardLogoIcon />, label: "Medical Analysis" },
  { key: "schemes",   icon: "🏛️", label: "Govt Schemes" },
];

const PATIENT_NAV = [
  { key: "profile",  icon: "👤", label: "My Profile" },
  { key: "records",  icon: "📋", label: "Health Records" },
  { key: "chatbot",  icon: "🤖", label: "AI Health Guide" },
  { key: "medical",  icon: <ClipboardLogoIcon />, label: "Medical Analysis" },
  { key: "schemes",  icon: "🏛️", label: "Govt Scheme Suggestions" },
];

function Sidebar({ user, active, onNav, mobileOpen, onOverlayClick, collapsed, onToggleCollapse, patientCount }) {
  const isStaff = user.role === "admin" || user.role === "super_admin" || user.role === "asha";
  const nav = isStaff
    ? ADMIN_NAV.map((item) => item.key === "patients" ? { ...item, badge: String(patientCount) } : item)
    : PATIENT_NAV;

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? "active" : ""}`} onClick={onOverlayClick} />
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>

        {/* ── Brand + Hamburger Toggle ── */}
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="brand-card" onClick={() => onNav(nav[0].key)}>
              <div className="brand-title">Asha<span>+</span></div>
            </div>
          )}
          {/* Hamburger / collapse button */}
          <button
            className="sidebar-hamburger"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </div>

        {/* ── Nav ── */}
        <nav className="sidebar-nav">
          {!collapsed && <div className="nav-label">Menu</div>}
          {nav.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${active === item.key ? "active" : ""} ${collapsed ? "nav-item-collapsed" : ""}`}
              onClick={() => onNav(item.key)}
              title={collapsed ? item.label : ""}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="nav-label-text">{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </>
              )}
              {collapsed && item.badge && (
                <span className="nav-badge-dot" />
              )}
            </button>
          ))}
        </nav>

        {/* ── Footer user card ── */}
        <div className="sidebar-footer">
          <div
            className={`nav-item ${collapsed ? "nav-item-collapsed" : ""}`}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "var(--radius-md)",
              cursor: "default",
            }}
          >
            <div
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "var(--gold-primary)", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, color: "var(--text-dark)",
              }}
            >
              {user.name[0]}
            </div>
            {!collapsed && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user.name}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                  {user.role === "admin"
                    ? "Admin"
                    : user.role === "super_admin"
                      ? "Super Admin"
                      : user.role === "asha"
                        ? `ASHA Worker • ${user.location}`
                        : "Patient"}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
function TopBar({ user, pageTitle, onLogout, onMenuToggle, onNav }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="sidebar-toggle" onClick={onMenuToggle}>☰</button>
        <div>
          <div className="topbar-title">{pageTitle}</div>
          <div className="topbar-breadcrumb">Asha+ Care › {pageTitle}</div>
        </div>
      </div>
      <div className="topbar-right">
        <div className="notif-btn">
          🔔
          <span className="notif-dot" />
        </div>
        {user.role === "asha" && (
          <span className="badge badge-blue">📍 {user.location}</span>
        )}
        {(user.role === "admin" || user.role === "super_admin") ? (
          <button
            type="button"
            className="welcome-text welcome-link"
            onClick={() => onNav && onNav("manage-admin")}
            title="Manage admin profile & security"
          >
            👤 {user.email}
          </button>
        ) : (
          <div className="welcome-text">{user.email}</div>
        )}
        <button className="btn-signout" onClick={onLogout}>Sign Out</button>
      </div>
    </header>
  );
}

// ─── Manage Admin Profile (name, password, security question, account safety) ─
function ManageAdminProfile({ adminProfile, setAdminProfile, onBack, toast, onLogout, onNameSaved }) {
  const [name, setName] = useState(adminProfile.name);

  const [curPw, setCurPw]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [confPw, setConfPw] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState("");

  const [secQ, setSecQ] = useState(adminProfile.securityQuestion || SECURITY_QUESTIONS[0]);
  const [secA, setSecA] = useState("");
  const [secCurPw, setSecCurPw] = useState("");
  const [secError, setSecError] = useState("");

  const strength = newPw ? passwordStrength(newPw) : null;

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) { toast("Name cannot be empty", "error"); return; }
    setAdminProfile((p) => ({ ...p, name: trimmed }));
    onNameSaved && onNameSaved(trimmed);
    toast("Profile updated", "success", "Display name changed successfully");
  };

  const submitPasswordChange = (e) => {
    e.preventDefault();
    setPwError("");
    if (curPw !== adminProfile.password) {
      setPwError("Current password is incorrect.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters long.");
      return;
    }
    if (!(/[a-z]/.test(newPw) && /[A-Z]/.test(newPw) && /\d/.test(newPw))) {
      setPwError("Password should include upper-case, lower-case letters and a number.");
      return;
    }
    if (newPw === curPw) {
      setPwError("New password must be different from your current password.");
      return;
    }
    if (newPw !== confPw) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    setAdminProfile((p) => ({
      ...p,
      password: newPw,
      lastPasswordChange: new Date().toISOString(),
      failedAttempts: 0,
      lockUntil: null,
    }));
    setCurPw(""); setNewPw(""); setConfPw("");
    toast("Password changed", "success", "Use your new password the next time you sign in.");
  };

  const submitSecurityQuestion = (e) => {
    e.preventDefault();
    setSecError("");
    if (secCurPw !== adminProfile.password) {
      setSecError("Please confirm your current password to update the security question.");
      return;
    }
    if (!secA.trim() || secA.trim().length < 3) {
      setSecError("Security answer must be at least 3 characters.");
      return;
    }
    setAdminProfile((p) => ({ ...p, securityQuestion: secQ, securityAnswer: secA.trim() }));
    setSecCurPw(""); setSecA("");
    toast("Security question saved", "success", "This will be used to verify your identity if you ever lose access.");
  };

  const fmt = (iso) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="page-body">
      <div className="card card-ai" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">👤 Manage Admin Profile</div>
          <button className="btn btn-outline-purple btn-sm" onClick={onBack}>← Back to Dashboard</button>
        </div>
        <div className="card-body">
          <div className="form-section">
            <div className="form-section-title">🪪 Basic Information</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Email (login id)</label>
                <input className="form-input" value={adminProfile.email} disabled
                  style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }} />
                <span className="form-hint">Login email is fixed for this account and can't be changed here.</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-gold btn-sm" onClick={saveName}>Save Name</button>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">🛡️ Account Security Overview</div>
            <div className="form-grid">
              <div className="form-group">
                <span className="form-label">Last Login</span>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>{fmt(adminProfile.lastLogin)}</span>
              </div>
              <div className="form-group">
                <span className="form-label">Last Password Change</span>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>{fmt(adminProfile.lastPasswordChange)}</span>
              </div>
              <div className="form-group">
                <span className="form-label">Security Question</span>
                <span className="badge" style={{ background: adminProfile.securityQuestion ? "#D1FAE5" : "#FEE2E2", color: adminProfile.securityQuestion ? "#065F46" : "#991B1B" }}>
                  {adminProfile.securityQuestion ? "Configured" : "Not set"}
                </span>
              </div>
              <div className="form-group">
                <span className="form-label">Failed Login Attempts</span>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>
                  {adminProfile.failedAttempts || 0} / {LOCKOUT_MAX_ATTEMPTS} {adminProfile.lockUntil && adminProfile.lockUntil > Date.now() ? " — 🔒 Currently locked" : ""}
                </span>
              </div>
            </div>
            <div className="form-hint" style={{ marginTop: 10 }}>
              For your protection, the account is automatically locked for 15 minutes after {LOCKOUT_MAX_ATTEMPTS} consecutive
              failed login attempts. This slows down brute-force and password-guessing attacks.
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">🔑 Change Password</div>
            <form onSubmit={submitPasswordChange}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <div className="input-wrapper">
                    <input
                      className="form-input has-action"
                      type={showCur ? "text" : "password"}
                      value={curPw}
                      onChange={(e) => setCurPw(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" className="input-action" onClick={() => setShowCur((p) => !p)}>
                      {showCur ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div className="input-wrapper">
                    <input
                      className="form-input has-action"
                      type={showNew ? "text" : "password"}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="input-action" onClick={() => setShowNew((p) => !p)}>
                      {showNew ? "🙈" : "👁️"}
                    </button>
                  </div>
                  {strength && (
                    <div className="pw-meter">
                      <div className={`pw-meter-fill ${strength.cls}`} style={{ width: `${strength.pct}%` }} />
                      <span className={`pw-meter-label ${strength.cls}`}>{strength.label}</span>
                    </div>
                  )}
                  <span className="form-hint">At least 8 characters, mixing upper/lower-case letters and a number. Add a symbol for extra strength.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    className="form-input"
                    type={showNew ? "text" : "password"}
                    value={confPw}
                    onChange={(e) => setConfPw(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              {pwError && <div className="form-error" style={{ marginTop: 10 }}>{pwError}</div>}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-gold btn-sm" type="submit">Update Password</button>
              </div>
            </form>
          </div>

          <div className="form-section">
            <div className="form-section-title">❓ Security Question (used for account recovery)</div>
            <form onSubmit={submitSecurityQuestion}>
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Choose a Question</label>
                  <select className="form-select" value={secQ} onChange={(e) => setSecQ(e.target.value)}>
                    {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Your Answer</label>
                  <input className="form-input" value={secA} onChange={(e) => setSecA(e.target.value)} placeholder="Answer (case-insensitive)" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm Current Password</label>
                  <input className="form-input" type="password" value={secCurPw} onChange={(e) => setSecCurPw(e.target.value)} required autoComplete="current-password" />
                </div>
              </div>
              {secError && <div className="form-error" style={{ marginTop: 10 }}>{secError}</div>}
              <div className="form-hint" style={{ marginTop: 6 }}>
                We never display your saved answer back to you, and it is only used to verify your identity — never as a substitute login method.
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-outline-purple btn-sm" type="submit">Save Security Question</button>
              </div>
            </form>
          </div>

          <div className="form-section" style={{ marginBottom: 0 }}>
            <div className="form-section-title">🚪 Session</div>
            <div className="form-hint" style={{ marginBottom: 10 }}>
              If you suspect unauthorized access to this account, sign out immediately and change your password from a trusted device.
            </div>
            <button className="btn btn-danger btn-sm" onClick={onLogout}>Sign Out This Session</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ patients, user, onNav, onEditPatient, onViewPatient, onDeletePatient }) {
  const male         = patients.filter((p) => p.gender === "Male").length;
  const female       = patients.filter((p) => p.gender === "Female").length;
  const thisMonth    = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const newThisMonth = patients.filter(
    (p) => (p.registered || "").slice(0, 7) === thisMonth
  ).length;
  const total = patients.length || 1;

  const stats = [
    { label: "Total Patients",    value: patients.length, icon: "👥", cls: "purple", change: `${patients.length} total` },
    { label: "New Registrations", value: newThisMonth,    icon: "✅", cls: "green",  change: "registered this month" },
    { label: "Male Patients",     value: male,            icon: "👨", cls: "blue",   change: `${((male/total)*100).toFixed(0)}% of total` },
    { label: "Female Patients",   value: female,          icon: "👩", cls: "pink",   change: `${((female/total)*100).toFixed(0)}% of total` },
  ];

  return (
    <div className="page-body">
      {/* Stat Cards */}
      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-change">{s.change}</div>
          </div>
        ))}
      </div>

      {/* Tab View */}
      <div className="flex items-center gap-3 mb-4">
        <div className="btn-tabs">
          <button className="btn-tab active">Patient Entry</button>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => onNav("register")}>
          ➕ Add Patient
        </button>
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <button className="btn btn-outline-purple btn-sm" onClick={() => onNav("manage-asha")}>
            ⚕️ Manage ASHA
          </button>
        )}
      </div>

      {/* Patients Card */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-hi">मरीज की जानकारी</span>
          </div>
        </div>
        <div className="card-body">
          <PatientsTable
            patients={patients}
            onEdit={onEditPatient}
            onView={onViewPatient}
            onDelete={onDeletePatient}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Patients Table ───────────────────────────────────────────────────────────
function PatientsTable({ patients, onEdit, onView, onDelete }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? patients.filter((p) => (p.name || "").toLowerCase().includes(query))
    : patients;

  return (
    <>
      <div className="search-bar">
        <div className="search-input-wrapper">
          <input
            className="search-input"
            type="text"
            autoComplete="off"
            placeholder="🔍  Search patients by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              color: "#1E1B4B",
              caretColor: "#7C3AED",
              WebkitTextFillColor: "#1E1B4B",
              opacity: 1,
              position: "relative",
              zIndex: 1,
            }}
          />
        </div>
        <select className="form-select" style={{ width: "auto", padding: "10px 14px" }}>
          <option>All Genders</option>
          <option>Male</option>
          <option>Female</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>ID</th>
              <th>Age / Gender</th>
              <th>Blood</th>
              <th>Contact</th>
              <th>Location</th>
              <th>Disease</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No patients found
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="patient-cell">
                      <div className="patient-avatar">{p.name[0]}</div>
                      <div>
                        <div
                          className="patient-name patient-name-link"
                          role="button"
                          tabIndex={0}
                          title="View patient profile & history"
                          onClick={() => onView?.(p)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onView?.(p)}
                        >
                          {p.name}
                        </div>
                        <div className="patient-id">{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-purple">{p.id}</span></td>
                  <td>{p.age} / {p.gender}</td>
                  <td><span className="blood-chip">{p.blood}</span></td>
                  <td className="text-sm">{p.mobile}</td>
                  <td className="text-sm">{p.village}</td>
                  <td>
                    <span className={`badge ${p.diseases === "None" ? "badge-green" : "badge-gold"}`}>
                      {p.diseases}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-outline-purple btn-sm" onClick={() => onEdit?.(p)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete?.(p)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Patient Registration / Edit Form ──────────────────────────────────────────
// OCR upload ceiling — matches the limit already used for the Tesseract.js
// pipeline in Medical Analysis (see MedicalUploadCard below). Tesseract.js runs
// entirely client-side in the browser; 8 MB comfortably covers a full-resolution
// phone photo of an Aadhaar/health card while keeping in-browser OCR responsive.
const MAX_OCR_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

// ── VoiceField defined OUTSIDE RegisterPatient so React never remounts it on re-render ──
function VoiceField({ field, label, type = "text", placeholder, required, form, set, listening, toggleVoice, voiceLang = "en-IN" }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{required && <span className="required">*</span>}
      </label>
      <div className="input-wrapper">
        <input
          className="form-input has-action"
          type={type}
          placeholder={placeholder}
          value={form[field]}
          onChange={(e) => set(field, e.target.value)}
          required={required}
        />
        <button
          type="button"
          className={`voice-btn ${listening === field ? "listening" : ""}`}
          onClick={() => toggleVoice(field)}
          title={`Voice input (${voiceLang === "hi-IN" ? "हिंदी" : "English"})`}
          style={{ position: "absolute", right: 8 }}
        >
          🎙️
        </button>
      </div>
    </div>
  );
}

function RegisterPatient({ onNav, toast, editPatient, onSave, onCancel, defaultVillage = "", user = null }) {
  const [listening, setListening] = useState(null);
  const [voiceLang, setVoiceLang] = useState("en-IN"); // "en-IN" | "hi-IN"
  const isStaff     = user?.role === "admin" || user?.role === "super_admin" || user?.role === "asha";
  const [createLogin,     setCreateLogin]     = useState(false);
  const [patientEmail,    setPatientEmail]    = useState(editPatient?.email || "");
  const [patientPassword, setPatientPassword] = useState("@patient1234");
  const [patientConfirm,  setPatientConfirm]  = useState("@patient1234");
  const [showPw,          setShowPw]          = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ocrFile, setOcrFile]     = useState(null);
  const [ocrPreview, setOcrPreview] = useState(null);
  const [ocrDragOver, setOcrDragOver] = useState(false);
  const [ocrError, setOcrError]   = useState("");
  const ocrGalleryInputRef = useRef(null);
  const ocrCameraInputRef  = useRef(null);
  const [form, setForm]           = useState(() =>
    editPatient
      ? {
          fullName: editPatient.name || "", age: String(editPatient.age ?? ""), dob: "",
          gender: editPatient.gender || "", mobile: editPatient.mobile || "", email: editPatient.email || "",
          weight: "", height: "", blood: editPatient.blood || "", address: "",
          village: editPatient.village || "", state: editPatient.state || "Uttar Pradesh", pin: "",
          diseases: editPatient.diseases === "None" ? "" : (editPatient.diseases || ""),
          allergies: "", medications: "", emergencyName: "", emergencyNumber: "",
        }
      : {
          fullName: "", age: "", dob: "", gender: "", mobile: "", email: "",
          weight: "", height: "", blood: "", address: "", village: defaultVillage,
          state: "Uttar Pradesh", pin: "", diseases: "", allergies: "",
          medications: "", emergencyName: "", emergencyNumber: "",
        }
  );

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleVoice = (field) => {
    if (listening === field) { setListening(null); return; }
    setListening(field);
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast("Microphone not supported in this browser", "error");
      setListening(null);
      return;
    }
    const rec = new SR();
    rec.lang = voiceLang;
    rec.onresult = (e) => {
      set(field, e.results[0][0].transcript);
      setListening(null);
    };
    rec.onerror = () => setListening(null);
    rec.start();
  };

  const acceptOcrFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setOcrError("Please upload an image file (JPG or PNG).");
      return;
    }
    if (f.size > MAX_OCR_FILE_SIZE) {
      setOcrError("That file is larger than 8 MB. Please upload a smaller photo.");
      return;
    }
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    setOcrError("");
    setOcrFile(f);
    setOcrPreview(URL.createObjectURL(f));
  };

  const resetOcrFile = () => {
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    setOcrFile(null);
    setOcrPreview(null);
    setOcrError("");
  };

  const handleOCR = async () => {
    if (!ocrFile) return;
    setUploading(true);
    setOcrError("");
    try {
      const Tesseract = await loadTesseract();
      const worker = await Tesseract.createWorker("eng", 1, { ...TESSERACT_CDN });
      const { data } = await worker.recognize(ocrFile);
      await worker.terminate();
      const text = (data?.text || "").trim();

      if (!text) throw new Error("Couldn't read text from this image. Try a clearer, well-lit photo.");

      const systemPrompt =
        "You are a patient-registration assistant for Indian health records. " +
        "The OCR text may come from an Aadhaar card, prescription, or other ID/medical document. " +
        "Extract patient info and return ONLY a valid JSON object with exactly these keys " +
        "(use empty string if not found):\n" +
        '{ "fullName": "", "age": "", "dob": "", "gender": "", "mobile": "", "address": "", "village": "", "state": "", "pin": "", "blood": "", "diseases": "" }\n' +
        "Rules: gender must be Male/Female/Other only. " +
        "dob must be in YYYY-MM-DD format — convert from whatever format is printed (e.g. 17/11/2002 → 2002-11-17); leave empty if no date of birth is printed. " +
        "age = digits only — calculate from dob if only a date of birth is printed and no age. " +
        "address = the house no./street/area portion ONLY — do not repeat the village, state, or PIN, those go in their own fields. " +
        "village = city/town/village name. " +
        "state must be exactly one of: Uttar Pradesh, Delhi, Bihar, Rajasthan, Maharashtra, Other — pick the closest match, or \"Other\" if unsure. " +
        "pin = the 6-digit Indian PIN code only, digits with no spaces or dashes. " +
        "blood = A+/B-/O+/AB+ format. " +
        "Return ONLY the JSON — no markdown, no explanation.";

      const { response } = await analyzeMedicalDocument(systemPrompt, text);

      try {
        const parsed = JSON.parse((response || "").replace(/```json|```/g, "").trim());

        // Native <input type="date"> silently rejects anything that isn't
        // strict YYYY-MM-DD, so guard against a malformed value before storing it.
        const dobVal = parsed.dob && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dob) ? parsed.dob : "";
        let ageVal = parsed.age || "";
        if (dobVal) {
          const today = new Date();
          const birth = new Date(dobVal);
          let calcAge = today.getFullYear() - birth.getFullYear();
          const m = today.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) calcAge--;
          if (calcAge >= 0) ageVal = String(calcAge);
        }

        setForm((f) => ({
          ...f,
          fullName: parsed.fullName || f.fullName,
          dob:      dobVal          || f.dob,
          age:      ageVal          || f.age,
          gender:   parsed.gender   || f.gender,
          mobile:   parsed.mobile   || f.mobile,
          address:  parsed.address  || f.address,
          village:  parsed.village  || f.village,
          state:    parsed.state    || f.state,
          pin:      parsed.pin      || f.pin,
          blood:    parsed.blood    || f.blood,
          diseases: parsed.diseases || f.diseases,
        }));
        toast("Document scanned! Fields auto-filled ✨", "success");
      } catch {
        toast("Document scanned — please verify and complete any missing fields.", "warning");
      }
    } catch (err) {
      setOcrError(err.message || "OCR failed. Please try again with a clearer image.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editPatient) {
      onSave?.({
        ...editPatient,
        name:     form.fullName || editPatient.name,
        age:      Number(form.age) || editPatient.age,
        gender:   form.gender    || editPatient.gender,
        mobile:   form.mobile    || editPatient.mobile,
        email:    form.email     || editPatient.email,
        village:  form.village   || editPatient.village,
        state:    form.state     || editPatient.state,
        blood:    form.blood     || editPatient.blood,
        diseases: form.diseases  || "None",
      });
      return;
    }
    // Staff-only login creation validation
    if (isStaff && createLogin) {
      if (!patientEmail.trim()) { toast("Enter patient email to create login.", "error"); return; }
      if (patientPassword.length < 8) { toast("Password must be at least 8 characters.", "error"); return; }
      if (patientPassword !== patientConfirm) { toast("Passwords do not match.", "error"); return; }
    }
    const newPatient = {
      name:       form.fullName,
      age:        Number(form.age) || 0,
      gender:     form.gender,
      blood:      form.blood,
      mobile:     form.mobile,
      email:      (isStaff && createLogin) ? patientEmail.trim() : (form.email || ""),
      village:    form.village,
      state:      form.state,
      diseases:   form.diseases || "None",
      registered: new Date().toISOString().slice(0, 10),
      ...(isStaff && createLogin && patientPassword
        ? { _createLogin: true, _password: patientPassword }
        : {}),
    };
    onSave?.(newPatient);
  };



  return (
    <div className="page-body">
      {/* OCR Zone (new registrations only) */}
      {!editPatient && (
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">📄 Smart Document Scanner (OCR)</div>
          <span className="ai-badge">✨ AI Powered</span>
        </div>
        <div className="card-body">
          {!ocrFile ? (
            <div
              className={`upload-zone ${ocrDragOver ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOcrDragOver(true); }}
              onDragLeave={() => setOcrDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOcrDragOver(false);
                acceptOcrFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={ocrGalleryInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => acceptOcrFile(e.target.files?.[0])}
              />
              <input
                ref={ocrCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => acceptOcrFile(e.target.files?.[0])}
              />
              <div className="upload-icon">📷</div>
              <div className="upload-title">Upload Aadhaar / Health Card</div>
              <div className="upload-sub">
                Drag a photo here, or choose an option below · JPG or PNG, up to 8 MB
              </div>
              <div className="flex gap-2 mt-2" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline-purple btn-sm"
                  onClick={() => ocrGalleryInputRef.current?.click()}
                >
                  🖼️ Upload Document
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  onClick={() => ocrCameraInputRef.current?.click()}
                >
                  📷 Take Photo
                </button>
              </div>
            </div>
          ) : (
            <div className="medical-upload-active">
              <div className="medical-preview-row">
                <img src={ocrPreview} alt="Uploaded document" className="medical-preview-thumb" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text-dark)" }} className="truncate">{ocrFile.name}</div>
                  <div className="text-sm text-muted">{(ocrFile.size / 1024).toFixed(0)} KB</div>
                  {!uploading && (
                    <div className="flex gap-2 mt-2" style={{ flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-gold btn-sm" onClick={handleOCR}>
                        🔍 Scan Document
                      </button>
                      <button type="button" className="btn btn-outline-purple btn-sm" onClick={resetOcrFile}>
                        Choose Different Image
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {uploading && (
                <div className="medical-progress">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="spinner"
                      style={{ borderColor: "rgba(124,58,237,0.25)", borderTopColor: "var(--purple-primary)", width: 16, height: 16 }}
                    />
                    <span className="text-sm" style={{ color: "var(--purple-deep)", fontWeight: 600 }}>
                      Scanning document &amp; extracting patient information…
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {ocrError && <div className="error-banner mt-2">⚠️ {ocrError}</div>}
        </div>
      </div>
      )}

      {/* Form */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-hi">{editPatient ? "मरीज संपादित करें (Edit Patient)" : "मरीज पंजीकरण"}</span>
            <span className="ai-badge">{editPatient ? "✏️ Edit Mode" : "🎙️ Voice Input"}</span>
          </div>
          <button
            type="button"
            onClick={() => setVoiceLang((l) => l === "en-IN" ? "hi-IN" : "en-IN")}
            title="Toggle voice language"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 20,
              border: "1.5px solid var(--purple-primary, #7c3aed)",
              background: voiceLang === "hi-IN" ? "var(--purple-primary, #7c3aed)" : "transparent",
              color: voiceLang === "hi-IN" ? "#fff" : "var(--purple-primary, #7c3aed)",
              fontWeight: 700, fontSize: 12, cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            🎙️ {voiceLang === "hi-IN" ? "हिंदी" : "English"}
            <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500, marginLeft: 4 }}>
              → {voiceLang === "hi-IN" ? "Switch to English" : "हिंदी में बदलें"}
            </span>
          </button>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>

            {/* Personal */}
            <div className="form-section">
              <div className="form-section-title">👤 Personal Information</div>
              <div className="form-grid">
                <VoiceField field="fullName" label="Full Name" placeholder="Enter full name" required form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dob}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => {
                      const dob = e.target.value;
                      set("dob", dob);
                      if (dob) {
                        const today = new Date();
                        const birth = new Date(dob);
                        let age = today.getFullYear() - birth.getFullYear();
                        const m = today.getMonth() - birth.getMonth();
                        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                        if (age >= 0) set("age", String(age));
                      } else {
                        set("age", "");
                      }
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Age<span className="required">*</span></label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="Auto-filled from DOB"
                    value={form.age}
                    onChange={(e) => set("age", e.target.value)}
                    style={form.dob ? { background: "rgba(124,58,237,0.06)", color: "#5b21b6", fontWeight: 600 } : {}}
                    title={form.dob ? "Auto-calculated from Date of Birth" : "Enter age manually or fill DOB above"}
                  />
                  {form.dob && (
                    <span style={{ fontSize: 11, color: "#7c3aed", marginTop: 4, display: "block" }}>
                      ✓ Auto-calculated from DOB
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Gender<span className="required">*</span>
                  </label>
                  <div className="gender-cards">
                    {["Male", "Female", "Other"].map((g) => (
                      <div
                        key={g}
                        className={`gender-card ${form.gender === g ? "selected" : ""}`}
                        onClick={() => set("gender", g)}
                      >
                        {g === "Male" ? "👨" : g === "Female" ? "👩" : "🧑"} {g}
                      </div>
                    ))}
                  </div>
                </div>
                <VoiceField field="mobile" label="Mobile Number" type="tel" placeholder="10-digit number" required form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <VoiceField field="email"  label="Email"    type="email" placeholder="patient@email.com" form={form} set={(field, val) => { set(field, val); setPatientEmail(val); }} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <div className="form-group">
                  <label className="form-label">Weight (kg)</label>
                  <input className="form-input" type="number" placeholder="e.g. 60"
                    value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Height (cm)</label>
                  <input className="form-input" type="number" placeholder="e.g. 165"
                    value={form.height} onChange={(e) => set("height", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Blood Group</label>
                  <select className="form-select" value={form.blood}
                    onChange={(e) => set("blood", e.target.value)}>
                    <option value="">Select blood group</option>
                    {["A+","A−","B+","B−","AB+","AB−","O+","O−"].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="form-section">
              <div className="form-section-title">📍 Address Details</div>
              <div className="form-grid">
                <VoiceField field="village" label="Village / City" placeholder="e.g. Ghaziabad" required form={form} set={set} listening={listening} toggleVoice={toggleVoice} />
                <div className="form-group">
                  <label className="form-label">State</label>
                  <select className="form-select" value={form.state}
                    onChange={(e) => set("state", e.target.value)}>
                    {["Uttar Pradesh","Delhi","Bihar","Rajasthan","Maharashtra","Other"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <VoiceField field="pin" label="PIN Code" type="number" placeholder="6-digit PIN" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <div className="form-group full">
                  <label className="form-label">Full Address</label>
                  <textarea className="form-textarea" placeholder="House no., street, area…"
                    value={form.address} onChange={(e) => set("address", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Medical */}
            <div className="form-section">
              <div className="form-section-title">🏥 Medical Information</div>
              <div className="form-grid">
                <VoiceField field="diseases"    label="Existing Diseases"   placeholder="e.g. Diabetes, TB" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <VoiceField field="allergies"   label="Allergies"           placeholder="e.g. Penicillin" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <VoiceField field="medications" label="Current Medications" placeholder="e.g. Metformin 500mg" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <VoiceField field="emergencyName"   label="Emergency Contact Name"   placeholder="Relative name" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
                <VoiceField field="emergencyNumber" label="Emergency Contact Number" type="tel" placeholder="10-digit" form={form} set={set} listening={listening} toggleVoice={toggleVoice} voiceLang={voiceLang} />
              </div>
            </div>

            {/* Staff-only: Create Login Account */}
            {isStaff && !editPatient && (
              <div className="form-section" style={{ marginTop: 8 }}>
                <div className="form-section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>🔐 Patient Login Account</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={createLogin}
                      onChange={(e) => setCreateLogin(e.target.checked)}
                      style={{ accentColor: "#7c3aed", width: 16, height: 16 }}
                    />
                    Create login for this patient
                  </label>
                </div>
                {createLogin && (
                  <div className="form-grid" style={{ marginTop: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Patient Email <span className="required">*</span></label>
                      <input
                        className="form-input"
                        type="email"
                        placeholder="patient@email.com"
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                        required={createLogin}
                      />
                      {form.email && patientEmail === form.email && (
                        <span style={{ fontSize: 11, color: "#7c3aed", marginTop: 4, display: "block" }}>
                          ✓ Synced from Email field above
                        </span>
                      )}
                    </div>
                    <div className="form-group" />
                    <div className="form-group">
                      <label className="form-label">Password <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <input
                          className="form-input has-action"
                          type={showPw ? "text" : "password"}
                          placeholder="Min. 8 characters"
                          value={patientPassword}
                          onChange={(e) => setPatientPassword(e.target.value)}
                          required={createLogin}
                        />
                        <button type="button" className="voice-btn"
                          onClick={() => setShowPw((v) => !v)}
                          style={{ position: "absolute", right: 8 }}>
                          {showPw ? "🙈" : "👁️"}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Confirm Password <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <input
                          className="form-input has-action"
                          type={showPw ? "text" : "password"}
                          placeholder="Re-enter password"
                          value={patientConfirm}
                          onChange={(e) => setPatientConfirm(e.target.value)}
                          required={createLogin}
                        />
                        {patientConfirm && (
                          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>
                            {patientPassword === patientConfirm ? "✅" : "❌"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="form-group full">
                      <div style={{ background: "rgba(124,58,237,0.08)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#5b21b6" }}>
                        💡 The patient can log in with this email and password to view their profile and visit history.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn btn-outline-purple"
                onClick={() => (editPatient ? onCancel?.() : onNav("patients"))}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold btn-lg">
                {editPatient ? "💾 Update Patient" : "✅ Register Patient"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Patient Dashboard ────────────────────────────────────────────────────────
function PatientDashboard({ user }) {
  const [patient, setPatient] = useState(null);

  // Look up this patient's own record in Firestore by matching their login email.
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "patients"), where("email", "==", user.email));
    return onSnapshot(q, (snap) => {
      if (!snap.empty) setPatient({ ...snap.docs[0].data(), id: snap.docs[0].id });
    });
  }, [user]);

  if (!patient) {
    return (
      <div className="page-body">
        <div className="card card-ai">
          <div className="card-body">Loading your profile…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      {/* Profile Header */}
      <div className="profile-header mb-6">
        <div className="profile-avatar">{patient.name[0]}</div>
        <div>
          <div className="profile-name">{patient.name}</div>
          <div className="profile-role">Patient ID: {patient.id}</div>
          <div className="profile-meta">
            <div className="profile-meta-item">🩸 {patient.blood}</div>
            <div className="profile-meta-item">👤 {patient.gender}, {patient.age} yrs</div>
            <div className="profile-meta-item">📍 {patient.village}</div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="stats-grid mb-6">
        <div className="stat-card gold">
          <div className="stat-icon">🩸</div>
          <div className="stat-label">Blood Group</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{patient.blood}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon">⚖️</div>
          <div className="stat-label">BMI Status</div>
          <div className="stat-value" style={{ fontSize: 20 }}>Normal</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">✅</div>
          <div className="stat-label">Last Checkup</div>
          <div className="stat-value" style={{ fontSize: 18 }}>Jan 2025</div>
        </div>
        <div className="stat-card pink">
          <div className="stat-icon">💊</div>
          <div className="stat-label">Active Conditions</div>
          <div className="stat-value">{patient.diseases === "None" ? 0 : 1}</div>
        </div>
      </div>

      {/* Health Info */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title-hi">स्वास्थ्य जानकारी</div>
          <span className="badge badge-green">✅ Up to Date</span>
        </div>
        <div className="card-body">
          <div className="form-grid">
            {[
              ["Full Name",   patient.name],
              ["Age",         `${patient.age} years`],
              ["Gender",      patient.gender],
              ["Blood Group", patient.blood],
              ["Mobile",      patient.mobile],
              ["Village",     patient.village],
              ["State",       patient.state],
              ["Condition",   patient.diseases],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="form-label">{k}</div>
                <div style={{ fontWeight: 600, color: "var(--text-dark)", marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Chatbot — structured message renderer ─────────────────────────────────
function formatBotMessage(text) {
  if (!text) return null;

  // Plain greeting or emergency message — no special structure detected
  const hasStructure =
    text.includes("## ") || text.includes("### ") || text.includes("| ");
  if (!hasStructure) {
    return (
      <span style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {text}
      </span>
    );
  }

  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  // ── helpers ────────────────────────────────────────────────────────────────
  const isTableRow  = (l) => l.trim().startsWith("|");
  const isSeparator = (l) => /^\|[-| :]+\|$/.test(l.trim());

  while (i < lines.length) {
    const raw  = lines[i];
    const line = raw.trim();

    // Skip blank lines
    if (!line) { i++; continue; }

    // ── ## Main heading ──────────────────────────────────────────────────────
    if (line.startsWith("## ")) {
      elements.push(
        <div
          key={`h2-${i}`}
          style={{
            fontWeight: 800,
            fontSize: 15.5,
            color: "var(--purple-primary)",
            marginBottom: 10,
            marginTop: 4,
            letterSpacing: 0.1,
            lineHeight: 1.4,
          }}
        >
          {line.replace(/^##\s+/, "")}
        </div>
      );
      i++; continue;
    }

    // ── ### Subheading ───────────────────────────────────────────────────────
    if (line.startsWith("### ")) {
      const sub = line.replace(/^###\s+/, "");
      const isDoctor   = sub.includes("🚨");
      const isMedicine = sub.includes("💊");
      const isKey      = sub.includes("✅");
      const color = isDoctor ? "#DC2626" : isMedicine ? "#7C3AED" : "#059669";
      const bg    = isDoctor ? "#FEF2F2" : isMedicine ? "#F5F3FF" : "#F0FDF4";
      const border = isDoctor ? "#FECACA" : isMedicine ? "#DDD6FE" : "#BBF7D0";
      elements.push(
        <div
          key={`h3-${i}`}
          style={{
            fontWeight: 700,
            fontSize: 13.5,
            color,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: "6px 12px",
            marginTop: 12,
            marginBottom: 6,
          }}
        >
          {sub}
        </div>
      );
      i++; continue;
    }

    // ── Markdown table (collect all rows) ────────────────────────────────────
    if (isTableRow(line)) {
      const tableLines = [];
      while (i < lines.length && (isTableRow(lines[i]) || isSeparator(lines[i]))) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // parse rows — split by | and strip empty edge cells
      const rows = tableLines
        .filter((l) => !isSeparator(l))
        .map((l) =>
          l
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim())
        );
      if (rows.length > 0) {
        const [headerRow, ...bodyRows] = rows;
        elements.push(
          <div
            key={`tbl-${i}`}
            style={{ overflowX: "auto", marginTop: 6, marginBottom: 6 }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  {headerRow.map((h, ci) => (
                    <th
                      key={ci}
                      style={{
                        background: "#7C3AED",
                        color: "#fff",
                        padding: "7px 10px",
                        textAlign: "left",
                        fontWeight: 600,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{ background: ri % 2 === 0 ? "#F5F3FF" : "#fff" }}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: "6px 10px",
                          borderBottom: "1px solid #EDE9FE",
                          fontSize: 12.5,
                          lineHeight: 1.5,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // ── Numbered list item  1. … ─────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${i}`}
          style={{ margin: "4px 0 8px 0", paddingLeft: 22 }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              style={{
                marginBottom: 6,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "#1F2937",
              }}
            >
              {item}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Bullet list item  - … ────────────────────────────────────────────────
    if (line.startsWith("- ") || line.startsWith("• ")) {
      const items = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("• "))
      ) {
        items.push(lines[i].trim().replace(/^[-•]\s+/, ""));
        i++;
      }
      elements.push(
        <ul
          key={`ul-${i}`}
          style={{ margin: "4px 0 8px 0", paddingLeft: 22 }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              style={{
                marginBottom: 5,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "#1F2937",
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── ⚠️ Disclaimer / warning line ─────────────────────────────────────────
    if (line.startsWith("⚠️")) {
      elements.push(
        <div
          key={`warn-${i}`}
          style={{
            background: "#FEF3C7",
            border: "1px solid #FCD34D",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12.5,
            color: "#92400E",
            fontWeight: 600,
            marginTop: 6,
            marginBottom: 4,
            lineHeight: 1.5,
          }}
        >
          {line}
        </div>
      );
      i++; continue;
    }

    // ── Horizontal rule --- ───────────────────────────────────────────────────
    if (/^-{3,}$/.test(line)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{ border: "none", borderTop: "1px solid #EDE9FE", margin: "10px 0" }}
        />
      );
      i++; continue;
    }

    // ── "Do not self-medicate." closing line ─────────────────────────────────
    if (
      line.toLowerCase().includes("do not self-medicate") ||
      line.toLowerCase().includes("स्वयं दवाई न लें")
    ) {
      elements.push(
        <div
          key={`close-${i}`}
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: "#DC2626",
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          {line}
        </div>
      );
      i++; continue;
    }

    // ── "See a doctor immediately if…" label ─────────────────────────────────
    if (
      line.toLowerCase().includes("see a doctor") ||
      line.toLowerCase().includes("तुरंत डॉक्टर")
    ) {
      elements.push(
        <div
          key={`seeDoc-${i}`}
          style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", marginTop: 4 }}
        >
          {line}
        </div>
      );
      i++; continue;
    }

    // ── Fallback: plain paragraph ─────────────────────────────────────────────
    elements.push(
      <p
        key={`p-${i}`}
        style={{ margin: "3px 0", fontSize: 13.5, lineHeight: 1.6, color: "#374151" }}
      >
        {line}
      </p>
    );
    i++;
  }

  return elements.length ? <>{elements}</> : <span>{text}</span>;
}

// ─── AI Chatbot ───────────────────────────────────────────────────────────────
const BOT_GREET =
  "नमस्ते! 🙏 I'm Asha AI, your health assistant. Ask me about symptoms, medicines, or general health tips!";

function ChatBot() {
  const [messages, setMessages] = useState([
    { from: "bot", text: BOT_GREET },
  ]);
  const [input, setInput]         = useState("");
  const [loading, setLoad]        = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [recentQuestions, setRecentQuestions] = useState([]);
  const recognitionRef = useRef(null);

  // ── Live listener: last 5 questions from Firestore cache ──────────────────
  // Strategy: try ordered (newest first). If that fails due to a missing Firestore
  // index or a rules issue, fall back to unordered so something always shows.
  useEffect(() => {
    let unsub = () => {};

    const attachUnordered = () => {
      const q = query(collection(db, "cached_responses"), limit(5));
      unsub = onSnapshot(
        q,
        (snap) => {
          const qs = snap.docs
            .map((d) => d.data().originalPrompt)
            .filter(Boolean);
          setRecentQuestions(qs);
        },
        (err) => {
          // If even the unordered query fails it is a rules problem.
          // Log it so the developer can see the real error in the console.
          console.error("[Asha AI] cached_responses read failed:", err.code, err.message);
        }
      );
    };

    const attachOrdered = () => {
      const q = query(
        collection(db, "cached_responses"),
        orderBy("createdAt", "desc"),
        limit(5)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const qs = snap.docs
            .map((d) => d.data().originalPrompt)
            .filter(Boolean);
          setRecentQuestions(qs);
        },
        (err) => {
          // "failed-precondition" = missing Firestore index for orderBy.
          // "permission-denied"   = Firestore rules not yet deployed.
          // Either way, fall back to unordered so recent questions still appear.
          console.warn(
            "[Asha AI] Ordered cache query failed (" + err.code + ") — falling back to unordered."
          );
          attachUnordered();
        }
      );
    };

    attachOrdered();
    return () => unsub();
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceSupported(false); return; }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-IN"; // understands Hindi/English mix reasonably well in most browsers
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch {} };
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setInput("");
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  const sendMsg = async () => {
    if (!input.trim()) return;
    const userMsg = { from: "user", text: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoad(true);

    try {
      const { response } = await askHealthAssistant(input);
      setMessages((m) => [...m, { from: "bot", text: response }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: `⚠️ ${err.message || "Unable to connect to AI. Please try again."}` },
      ]);
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="page-body">
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            🤖 AI Health Assistant
            <span className="ai-badge">✨ AI Powered</span>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="chatbot-container" style={{ height: 520, border: "none" }}>
            <div className="chatbot-header">
              <div className="chatbot-avatar">🩺</div>
              <div>
                <div className="chatbot-name">Asha AI</div>
                <div className="chatbot-status">
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#86EFAC", display: "inline-block"
                  }} />
                  Online
                </div>
              </div>
            </div>

            <div className="chatbot-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.from}`}>
                  {m.from === "bot" ? formatBotMessage(m.text) : m.text}
                </div>
              ))}
              {loading && (
                <div className="chat-msg bot" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="spinner" style={{
                    borderColor: "rgba(124,58,237,0.3)",
                    borderTopColor: "var(--purple-primary)", width: 14, height: 14
                  }} />
                  Thinking…
                </div>
              )}
            </div>

            <div className="chatbot-input-area">
              <input
                className="chatbot-input"
                placeholder={listening ? "🎙️ Listening… speak now" : "Ask a health question in English or Hindi…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              />
              {voiceSupported && (
                <button
                  type="button"
                  className={`voice-btn ${listening ? "listening" : ""}`}
                  onClick={toggleVoice}
                  title={listening ? "Stop listening" : "Ask by voice"}
                >
                  {listening ? "⏹️" : "🎤"}
                </button>
              )}
              <button className="btn btn-gold btn-sm" onClick={sendMsg} disabled={loading}>
                Send ➤
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Suggested Questions (hardcoded) ─────────────────────────────── */}
      <div className="mt-4">
        <div className="form-label mb-2">💡 Suggested Questions</div>
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          {[
            "What are diabetes symptoms?",
            "BP control tips in Hindi",
            "Safe medicines in pregnancy",
            "बच्चों में बुखार का इलाज",
          ].map((q) => (
            <button
              key={q}
              className="btn btn-outline-purple btn-sm"
              onClick={() => setInput(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent Questions (from Firestore cache) ──────────────────────── */}
      {recentQuestions.length > 0 && (
        <div className="mt-3">
          <div
            className="form-label mb-2"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            🕐 Recently Asked
            <span
              style={{
                fontSize: 11,
                background: "#EDE9FE",
                color: "#7C3AED",
                borderRadius: 20,
                padding: "1px 8px",
                fontWeight: 600,
              }}
            >
              {recentQuestions.length}
            </span>
          </div>
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            {recentQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setInput(q)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "#F5F3FF",
                  border: "1px solid #DDD6FE",
                  borderRadius: 20,
                  padding: "5px 13px",
                  fontSize: 12.5,
                  color: "#5B21B6",
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "background 0.15s",
                  maxWidth: 260,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#EDE9FE")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F5F3FF")}
                title={q}
              >
                <span style={{ fontSize: 13 }}>🔁</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Health Records ───────────────────────────────────────────────────────────
function HealthRecords({ user, history, setHistory }) {
  const [patient, setPatient] = useState(null);

  // Look up this patient's own record in Firestore by matching their login email.
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "patients"), where("email", "==", user.email));
    return onSnapshot(q, (snap) => {
      if (!snap.empty) setPatient({ ...snap.docs[0].data(), id: snap.docs[0].id });
    });
  }, [user]);

  // Real-time visit history for this patient (admin/ASHA view loads this via
  // the activePatient effect in App; a patient viewing their own records needs
  // its own listener since there's no activePatient set for them).
  useEffect(() => {
    if (!patient) return;
    const q = query(
      collection(db, "patients", patient.id, "visits"),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      const visits = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setHistory((prev) => ({ ...prev, [patient.id]: visits }));
    });
  }, [patient]);

  if (!patient) {
    return (
      <div className="page-body">
        <div className="card card-ai">
          <div className="card-body">Loading your records…</div>
        </div>
      </div>
    );
  }

  const records = history[patient.id] || [];

  return (
    <div className="page-body">
      <PatientHistoryCard
        patientId={patient.id}
        records={records}
        setHistory={setHistory}
        isAdmin={false}
      />
    </div>
  );
}

// ─── Govt Scheme Suggestions ───────────────────────────────────────────────────
// Eligibility + document data sourced from the official scheme analysis notes,
// kept bilingual (English / Hindi) so an ASHA worker can switch language
// instantly inside the modal while standing in front of a patient.
const GOVT_SCHEMES = [
  {
    id: "scheme-01",
    icon: "🏥", name: "Ayushman Bharat (PM-JAY)",
    desc: "Free hospitalisation cover up to ₹5 lakh per family per year at empanelled hospitals.",
    eligibilitySummary: "Families listed under SECC database / state extension criteria",
    officialLink: "https://pmjay.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/ab-pmjay",
    eligibility: {
      en: [
        "Rural Beneficiaries: Households living in single-room dwellings with kucha walls/roofs, households with no adult male member aged 16–59, disabled members with no able-bodied adult for support, and SC/ST or landless households deriving major income from manual casual labour.",
        "Urban Beneficiaries: Families belonging to 11 defined occupational categories, including ragpickers, domestic workers, street vendors, sanitation workers, and construction labourers.",
        "Automatic Inclusions: Destitute individuals, manual scavengers, legally released bonded labour, primitive tribal groups, and households without shelter.",
        "RSBY Coverage: Families enrolled under Rashtriya Swasthya Bima Yojana (RSBY) as of 28 February 2018 are automatically eligible.",
        "Senior Citizens: As of September 2024, all senior citizens aged 70 years and above are eligible for up to ₹5 lakh health coverage, regardless of socio-economic status.",
      ],
      hi: [
        "ग्रामीण लाभार्थी: एक कमरे के कच्चे मकान में रहने वाले परिवार, जिनमें 16 से 59 वर्ष के बीच कोई वयस्क पुरुष सदस्य न हो, दिव्यांग सदस्य जिनकी सहायता के लिए कोई सक्षम वयस्क न हो, तथा SC/ST या भूमिहीन परिवार जिनकी मुख्य आय शारीरिक श्रम से होती है।",
        "शहरी लाभार्थी: 11 निर्धारित व्यावसायिक श्रेणियों के परिवार, जैसे कबाड़ बीनने वाले, घरेलू कामगार, फेरीवाले, सफाई कर्मचारी और निर्माण मजदूर।",
        "स्वचालित समावेशन: निराश्रित व्यक्ति, सफाई कर्मी, कानूनी रूप से मुक्त बंधुआ मजदूर, आदिम जनजातीय समूह और बेघर परिवार।",
        "RSBY कवरेज: 28 फरवरी 2018 तक RSBY के तहत पंजीकृत परिवार स्वतः पात्र हैं।",
        "वरिष्ठ नागरिक: सितंबर 2024 से, 70 वर्ष या उससे अधिक आयु के सभी वरिष्ठ नागरिक, सामाजिक-आर्थिक स्थिति की परवाह किए बिना, ₹5 लाख तक के स्वास्थ्य कवरेज के लिए पात्र हैं।",
      ],
    },
    documents: {
      en: [
        "Aadhaar card or government-approved photo ID.",
        "Ration card or alternative family ID.",
        "Socio-Economic Caste Census (SECC) reference number (for rural families).",
        "Proof of Address and contact details (mobile, e-mail).",
        "Caste Certificate and Income Certificate (if applicable).",
        "Document proof of the current status of the family (joint or nuclear).",
      ],
      hi: [
        "आधार कार्ड या सरकार द्वारा स्वीकृत फोटो पहचान पत्र।",
        "राशन कार्ड या वैकल्पिक परिवार पहचान पत्र।",
        "SECC संदर्भ संख्या (ग्रामीण परिवारों के लिए)।",
        "पता प्रमाण और संपर्क विवरण (मोबाइल, ईमेल)।",
        "जाति प्रमाण पत्र और आय प्रमाण पत्र (यदि लागू हो)।",
        "परिवार की वर्तमान स्थिति का दस्तावेज़ी प्रमाण (संयुक्त या एकल)।",
      ],
    },
  },
  {
    id: "scheme-02",
    icon: "🤰", name: "Janani Suraksha Yojana (JSY)",
    desc: "Cash assistance for institutional delivery to reduce maternal and infant mortality.",
    eligibilitySummary: "Pregnant women, especially BPL households in low-performing states",
    officialLink: "https://nhm.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/jsy1",
    eligibility: {
      en: [
        "Low Performing States (LPS): All pregnant women delivering in a government or accredited private health institution are eligible — no marriage or BPL certification needed.",
        "High Performing States (HPS): Pregnant women delivering in government institutions are eligible only if they belong to a BPL household or SC/ST.",
        "Accredited Private Institutions: Across all states, the applicant must be from a BPL household or an SC/ST woman with a referral slip from health workers.",
        "Home Deliveries: Pregnant women from BPL households receive cash benefits for home births, regardless of age and number of children.",
        "Specific Exclusions/Criteria: Depending on state norms, benefit for general categories may be restricted to women aged 19+ and the first two live births only — SC/ST women are exempt from this parity limit.",
      ],
      hi: [
        "निम्न निष्पादन वाले राज्य (LPS): सरकारी या मान्यता प्राप्त निजी स्वास्थ्य संस्थान में प्रसव कराने वाली सभी गर्भवती महिलाएं पात्र हैं — इसके लिए विवाह या BPL प्रमाणन आवश्यक नहीं है।",
        "उच्च निष्पादन वाले राज्य (HPS): सरकारी संस्थानों में प्रसव कराने वाली गर्भवती महिलाएं केवल तभी पात्र हैं जब वे BPL परिवार या SC/ST से संबंधित हों।",
        "मान्यता प्राप्त निजी संस्थान: सभी राज्यों में, आवेदक को BPL परिवार या SC/ST महिला होना चाहिए और स्वास्थ्य कार्यकर्ता से रेफरल स्लिप होनी चाहिए।",
        "घर पर प्रसव: BPL परिवारों की गर्भवती महिलाओं को घर पर प्रसव के लिए नकद सहायता मिलती है, उम्र और बच्चों की संख्या की परवाह किए बिना।",
        "विशेष अपवाद/मानदंड: राज्य के नियमों के अनुसार, सामान्य श्रेणी के लिए लाभ 19 वर्ष या अधिक उम्र की महिलाओं और केवल पहले दो जीवित प्रसवों तक सीमित हो सकता है — SC/ST महिलाओं को इस सीमा से छूट है।",
      ],
    },
    documents: {
      en: [
        "Mother and Child Protection (MCP) Card.",
        "Photocopy of BPL Ration Card or Antyodaya Anna Yojana card.",
        "Photocopy of SC/ST status certificate (if applicable).",
        "Hospital Discharge Certificate (for institutional delivery).",
        "Copy of Aadhaar Card and passbook of the Aadhaar-linked bank account.",
      ],
      hi: [
        "मातृ एवं शिशु सुरक्षा (MCP) कार्ड।",
        "BPL राशन कार्ड या अंत्योदय अन्न योजना कार्ड की फोटोकॉपी।",
        "SC/ST स्थिति प्रमाण पत्र की फोटोकॉपी (यदि लागू हो)।",
        "अस्पताल डिस्चार्ज प्रमाण पत्र (संस्थागत प्रसव के लिए)।",
        "आधार कार्ड की प्रतिलिपि और आधार-लिंक्ड बैंक खाते की पासबुक।",
      ],
    },
  },
  {
    id: "scheme-03",
    icon: "🍼", name: "Janani Shishu Suraksha Karyakram (JSSK)",
    desc: "Free delivery, C-section and newborn care, including drugs, diet and transport.",
    eligibilitySummary: "All pregnant women delivering in public health institutions",
    officialLink: "https://nhm.gov.in/showlink.php?id=178",
    detailLink: "https://web.umang.gov.in/landing/scheme/detail/janani-shishu-suraksha-karyakram_jssk.html",
    eligibility: {
      en: [
        "Pregnant Women: All pregnant women who access government health facilities for delivery are entitled to completely free and cashless services (including C-sections, medicines, diagnostics and diet).",
        "Sick Newborns: Free treatment is extended to sick newborns and infants accessing government health facilities up to 30 days after birth.",
        "Universal Applicability: Eligibility is non-conditional — no income limit, no BPL condition, and no restriction on religion, caste or state.",
        "No Registration Bar: Entitlement is automatic; no prior registration is required for accessing emergency services.",
      ],
      hi: [
        "गर्भवती महिलाएं: प्रसव के लिए सरकारी स्वास्थ्य सुविधाओं का उपयोग करने वाली सभी गर्भवती महिलाएं पूर्णतः मुफ्त और नकद-रहित सेवाओं (सिजेरियन, दवाइयां, जांच, आहार सहित) की हकदार हैं।",
        "बीमार नवजात: जन्म के 30 दिन बाद तक सरकारी स्वास्थ्य सुविधाओं में आने वाले बीमार नवजातों और शिशुओं को मुफ्त उपचार दिया जाता है।",
        "सार्वभौमिक पात्रता: पात्रता गैर-शर्तीय है — कोई आय सीमा नहीं, कोई BPL शर्त नहीं, और धर्म, जाति या राज्य पर कोई प्रतिबंध नहीं।",
        "कोई पंजीकरण आवश्यक नहीं: पात्रता स्वचालित है; आपातकालीन सेवाओं के लिए पूर्व पंजीकरण की आवश्यकता नहीं है।",
      ],
    },
    documents: {
      en: [
        "Aadhaar Number/Card (helpful for record-keeping but not mandatory for emergency services).",
        "Mother and Child Health (MCH) / Mamta Card (if registered).",
        "Janani Suraksha Yojana (JSY) Card (if the applicant is a JSY beneficiary).",
        "Ration card.",
        "Address proof / Domicile certificate.",
      ],
      hi: [
        "आधार नंबर/कार्ड (रिकॉर्ड के लिए सहायक, पर आपातकालीन सेवाओं के लिए अनिवार्य नहीं)।",
        "मातृ एवं शिशु स्वास्थ्य (MCH) / ममता कार्ड (यदि पंजीकृत हो)।",
        "जननी सुरक्षा योजना (JSY) कार्ड (यदि आवेदक JSY लाभार्थी है)।",
        "राशन कार्ड।",
        "पता प्रमाण / निवास प्रमाण पत्र।",
      ],
    },
  },
  {
    id: "scheme-04",
    icon: "👶", name: "Pradhan Mantri Matru Vandana Yojana (PMMVY)",
    desc: "₹5,000 cash incentive for the first living child to support nutrition and rest.",
    eligibilitySummary: "Pregnant and lactating mothers, first child only",
    officialLink: "https://pmmvy.wcd.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/pmmvy",
    eligibility: {
      en: [
        "Covers pregnant women and lactating mothers who are at least 19 years old.",
        "Provides financial assistance primarily for the first live birth — ₹5,000 in installments to compensate for wage loss and promote healthcare.",
        "Also covers the birth of a second child exclusively if it is a girl, with a single incentive installment of ₹6,000.",
        "Applicants must belong to economically weaker/disadvantaged sections: net family income below ₹8 lakh/year, SC/ST women, or women who are 40% or fully disabled (Divyang Jan).",
        "Beneficiaries holding an MGNREGA Job Card, e-Shram card, BPL Ration Card, PMJAY card, or Kisan Samman Nidhi are also automatically eligible.",
        "Women in regular employment with Central/State Government or PSUs who receive similar paid maternity benefits are strictly excluded.",
      ],
      hi: [
        "यह योजना कम से कम 19 वर्ष की आयु की गर्भवती महिलाओं और स्तनपान कराने वाली माताओं को कवर करती है।",
        "मुख्य रूप से पहले जीवित बच्चे के लिए वित्तीय सहायता — मजदूरी हानि की पूर्ति और स्वास्थ्य देखभाल बढ़ाने के लिए किस्तों में ₹5,000।",
        "दूसरे बच्चे के जन्म पर केवल तभी कवर करती है जब वह बेटी हो — ₹6,000 की एकल प्रोत्साहन किस्त।",
        "आवेदकों को आर्थिक रूप से कमजोर/वंचित वर्गों से होना चाहिए: ₹8 लाख प्रति वर्ष से कम पारिवारिक आय, SC/ST महिलाएं, या 40% अथवा पूर्ण रूप से दिव्यांग (दिव्यांगजन) महिलाएं।",
        "MGNREGA जॉब कार्ड, ई-श्रम कार्ड, BPL राशन कार्ड, PMJAY कार्ड या किसान सम्मान निधि लाभार्थी भी स्वतः पात्र हैं।",
        "केंद्र/राज्य सरकार या सार्वजनिक उपक्रमों (PSU) में नियमित रोजगार में रहने वाली और समान वैतनिक मातृत्व लाभ प्राप्त करने वाली महिलाएं इस योजना से बाहर हैं।",
      ],
    },
    documents: {
      en: [
        "Aadhaar card or an alternative official identity proof.",
        "Mother and Child Protection (MCP) card or RCHI card.",
        "Details of an Aadhaar-mapped bank or post office account for Direct Benefit Transfer.",
        "Eligibility proof document (e.g., Income certificate, BPL card, e-Shram card, or MGNREGA card).",
        "Child birth certificate and child immunization details to claim later installments.",
      ],
      hi: [
        "आधार कार्ड या वैकल्पिक सरकारी पहचान प्रमाण।",
        "MCP कार्ड या RCHI कार्ड।",
        "प्रत्यक्ष लाभ हस्तांतरण (DBT) के लिए आधार-लिंक्ड बैंक या डाकघर खाते का विवरण।",
        "पात्रता प्रमाण दस्तावेज (जैसे आय प्रमाण पत्र, BPL कार्ड, ई-श्रम कार्ड, या MGNREGA कार्ड)।",
        "बाद की किस्तों के दावे के लिए बच्चे का जन्म प्रमाण पत्र और टीकाकरण विवरण।",
      ],
    },
  },
  {
    id: "scheme-05",
    icon: "🧒", name: "Rashtriya Bal Swasthya Karyakram (RBSK)",
    desc: "Free child health screening and early intervention for birth defects and deficiencies.",
    eligibilitySummary: "Children aged 0–18 years in the community",
    officialLink: "https://rbsk.mohfw.gov.in/",
    detailLink: "https://rbsk.mohfw.gov.in/RBSK/aboutusdata",
    eligibility: {
      en: [
        "Targets all children from birth up to 18 years of age residing in the community.",
        "Guarantees free comprehensive screening for the \"4 Ds\": Defects at birth, Diseases, Deficiencies, and Developmental delays, spanning 32 common health conditions.",
        "Newborns (0–6 weeks) are screened at public health delivery points by medical officers and at home by ASHA workers.",
        "Children aged 6 weeks to 6 years enrolled in Anganwadi Centres are actively screened by Mobile Health Teams (MHT).",
        "Older children/adolescents aged 6–18 years in Government and Government-aided schools are similarly covered by Mobile Health Teams.",
        "Any child diagnosed with a covered condition receives early intervention, free treatment, and surgical management (e.g., Cochlear implants) at the tertiary level, free of cost.",
      ],
      hi: [
        "यह कार्यक्रम समुदाय में रहने वाले जन्म से 18 वर्ष तक के सभी बच्चों को लक्षित करता है।",
        "\"4 D\" — जन्म दोष, रोग, कमियां, और विकासात्मक देरी — के लिए मुफ्त व्यापक स्क्रीनिंग की गारंटी देता है, जो 32 सामान्य स्वास्थ्य स्थितियों को कवर करता है।",
        "नवजात शिशुओं (0–6 सप्ताह) की जांच सार्वजनिक स्वास्थ्य केंद्रों पर चिकित्सा अधिकारियों द्वारा और घर पर आशा कार्यकर्ताओं द्वारा की जाती है।",
        "आंगनवाड़ी केंद्रों में नामांकित 6 सप्ताह से 6 वर्ष तक के बच्चों की जांच मोबाइल हेल्थ टीम (MHT) द्वारा सक्रिय रूप से की जाती है।",
        "सरकारी/सरकारी सहायता प्राप्त स्कूलों में 6–18 वर्ष के बड़े बच्चे और किशोर भी मोबाइल हेल्थ टीम द्वारा कवर किए जाते हैं।",
        "किसी स्वास्थ्य स्थिति से निदान बच्चे को शीघ्र हस्तक्षेप सेवाएं, मुफ्त उपचार, और तृतीयक स्तर पर सर्जिकल प्रबंधन (जैसे कॉकलियर इम्प्लांट) पूर्णतः मुफ्त मिलता है।",
      ],
    },
    documents: {
      en: [
        "Aadhaar Card or Birth Certificate of the child (for advanced hospital registration and tracking).",
        "Parents' identity proof and address proof.",
        "Anganwadi enrollment record or School ID card (for children above 6 weeks) to establish institutional mapping.",
        "Medical Referral slip from the Mobile Health Team (MHT) or local Medical Officers for advanced care at District Early Intervention Centers (DEIC).",
      ],
      hi: [
        "बच्चे का आधार कार्ड या जन्म प्रमाण पत्र (उन्नत अस्पताल पंजीकरण और ट्रैकिंग के लिए)।",
        "माता-पिता का पहचान प्रमाण और पता प्रमाण।",
        "6 सप्ताह से अधिक उम्र के बच्चों के लिए आंगनवाड़ी नामांकन रिकॉर्ड या स्कूल आईडी कार्ड।",
        "जिला शीघ्र हस्तक्षेप केंद्र (DEIC) में उन्नत देखभाल के लिए मोबाइल हेल्थ टीम (MHT) या स्थानीय चिकित्सा अधिकारियों द्वारा जारी मेडिकल रेफरल स्लिप।",
      ],
    },
  },
  {
    id: "scheme-06",
    icon: "💉", name: "Mission Indradhanush",
    desc: "Free immunisation drive covering vaccine-preventable childhood diseases.",
    eligibilitySummary: "Unvaccinated or partially vaccinated children and pregnant women",
    officialLink: "https://immunization.mohfw.gov.in/",
    detailLink: "https://www.indiascienceandtechnology.gov.in/st-visions/national-mission/mission-indradhanush-mi",
    eligibility: {
      en: [
        "Core target: all children under 2 years of age who are partially immunized or have never been immunized under the routine Universal Immunization Programme (UIP).",
        "Under expanded phases like Intensified Mission Indradhanush (IMI), on-demand vaccination is extended to children up to 5 years of age during specific drives.",
        "Includes pregnant women who need to be fully immunized (e.g., catching up on missed Tetanus vaccines).",
        "Functions as a broad catch-up initiative ensuring no socio-economic barriers prevent life-saving protection.",
        "Eligible beneficiaries receive free vaccines against Polio, Measles, Hepatitis B, Tetanus, Diphtheria, Tuberculosis, Whooping Cough, Pneumonia, and Japanese Encephalitis.",
      ],
      hi: [
        "मुख्य लक्ष्य समूह: 2 वर्ष से कम उम्र के वे सभी बच्चे जो नियमित सार्वभौमिक टीकाकरण कार्यक्रम (UIP) के तहत आंशिक रूप से टीकाकृत या पूरी तरह से अनटीकाकृत हैं।",
        "गहन मिशन इंद्रधनुष (IMI) जैसे विस्तारित चरणों के तहत, विशेष अभियानों के दौरान मांग पर 5 वर्ष तक के बच्चों को भी कवरेज दिया जाता है।",
        "इसमें वे गर्भवती महिलाएं भी शामिल हैं जिन्हें पूर्ण टीकाकरण की आवश्यकता है (जैसे छूटे हुए टिटनेस के टीके पूरे करना)।",
        "यह एक व्यापक कैच-अप पहल है जो सुनिश्चित करती है कि कोई भी सामाजिक-आर्थिक बाधा जीवन रक्षक सुरक्षा में रुकावट न बने।",
        "पात्र लाभार्थियों को पोलियो, खसरा, हेपेटाइटिस बी, टिटनेस, डिप्थीरिया, टीबी, काली खांसी, निमोनिया और जापानी इंसेफेलाइटिस के विरुद्ध मुफ्त टीके मिलते हैं।",
      ],
    },
    documents: {
      en: [
        "Mother and Child Protection (MCP) card or any previous immunization logbook.",
        "Aadhaar card or parent/guardian identity proof (helpful for maintaining health registries).",
        "Hospital discharge summary or birth certificate of the infant to map out the missed vaccine timeline.",
      ],
      hi: [
        "MCP कार्ड या पूर्व टीकाकरण लॉगबुक।",
        "आधार कार्ड या माता-पिता/अभिभावक का पहचान प्रमाण (स्वास्थ्य रिकॉर्ड बनाए रखने के लिए सहायक)।",
        "छूटे हुए टीकों की समय-सीमा तय करने के लिए अस्पताल डिस्चार्ज समरी या शिशु का जन्म प्रमाण पत्र।",
      ],
    },
  },
];

// ─── Scheme form <-> data helpers ────────────────────────────────────────────
// The admin form edits bilingual eligibility/document lists as plain
// newline-separated textareas; these helpers convert to/from the array shape
// the rest of the app (and the read-only modal) expects.
const BLANK_SCHEME_FORM = {
  icon: "🏥",
  name: "",
  desc: "",
  eligibilitySummary: "",
  officialLink: "",
  detailLink: "",
  eligibilityEn: "",
  eligibilityHi: "",
  documentsEn: "",
  documentsHi: "",
};

const linesToList = (str) => str.split("\n").map((s) => s.trim()).filter(Boolean);
const listToLines = (arr) => (arr || []).join("\n");

function schemeToForm(scheme) {
  return {
    icon: scheme.icon || "🏥",
    name: scheme.name || "",
    desc: scheme.desc || "",
    eligibilitySummary: scheme.eligibilitySummary || "",
    officialLink: scheme.officialLink || "",
    detailLink: scheme.detailLink || "",
    eligibilityEn: listToLines(scheme.eligibility?.en),
    eligibilityHi: listToLines(scheme.eligibility?.hi),
    documentsEn: listToLines(scheme.documents?.en),
    documentsHi: listToLines(scheme.documents?.hi),
  };
}

function formToScheme(form, existingId) {
  return {
    id: existingId || `scheme-${Date.now()}`,
    icon: form.icon.trim() || "🏥",
    name: form.name.trim(),
    desc: form.desc.trim(),
    eligibilitySummary: form.eligibilitySummary.trim(),
    officialLink: form.officialLink.trim(),
    detailLink: form.detailLink.trim(),
    eligibility: { en: linesToList(form.eligibilityEn), hi: linesToList(form.eligibilityHi) },
    documents: { en: linesToList(form.documentsEn), hi: linesToList(form.documentsHi) },
  };
}

// ─── Add / Edit Scheme modal (admin only) ────────────────────────────────────
function SchemeFormModal({ mode, initial, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => (initial ? schemeToForm(initial) : BLANK_SCHEME_FORM));
  const [formLang, setFormLang] = useState("en");
  const [error, setError] = useState("");

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.desc.trim() || !form.eligibilitySummary.trim()) {
      setError("Scheme name, description and eligibility summary are required.");
      return;
    }
    if (!linesToList(form.eligibilityEn).length || !linesToList(form.documentsEn).length) {
      setError("Add at least one English eligibility point and one English document.");
      return;
    }
    setError("");
    onSubmit(formToScheme(form, initial?.id));
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {mode === "edit" ? "✏️ Edit Government Scheme" : "➕ Add New Government Scheme"}
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">⚠️ {error}</div>}

            <div className="scheme-icon-name-row">
              <div className="form-group">
                <label className="form-label">Icon</label>
                <input
                  className="form-input scheme-icon-input"
                  value={form.icon}
                  onChange={(e) => set("icon", e.target.value)}
                  maxLength={4}
                  placeholder="🏥"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Scheme Name<span className="required">*</span></label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Ayushman Bharat (PM-JAY)"
                />
              </div>
            </div>

            <div className="form-group mb-4">
              <label className="form-label">Short Description<span className="required">*</span></label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 56 }}
                value={form.desc}
                onChange={(e) => set("desc", e.target.value)}
                placeholder="One-line summary shown on the scheme card"
              />
            </div>

            <div className="form-group mb-4">
              <label className="form-label">Eligibility Summary (shown on card)<span className="required">*</span></label>
              <input
                className="form-input"
                value={form.eligibilitySummary}
                onChange={(e) => set("eligibilitySummary", e.target.value)}
                placeholder="e.g. Families listed under SECC database"
              />
            </div>

            <div className="form-grid mb-4">
              <div className="form-group">
                <label className="form-label">Official Website Link</label>
                <input
                  className="form-input"
                  type="url"
                  value={form.officialLink}
                  onChange={(e) => set("officialLink", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Detailed Eligibility Criteria Link</label>
                <input
                  className="form-input"
                  type="url"
                  value={form.detailLink}
                  onChange={(e) => set("detailLink", e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="form-section-title">📋 Eligibility &amp; Documents Content</div>

            <div className="btn-tabs lang-toggle-row">
              <button type="button" className={`btn-tab ${formLang === "en" ? "active" : ""}`} onClick={() => setFormLang("en")}>
                English
              </button>
              <button type="button" className={`btn-tab ${formLang === "hi" ? "active" : ""}`} onClick={() => setFormLang("hi")}>
                हिंदी
              </button>
            </div>

            {formLang === "en" ? (
              <>
                <div className="form-group mb-4">
                  <label className="form-label">Eligibility Points (English)<span className="required">*</span></label>
                  <textarea
                    className="form-textarea"
                    value={form.eligibilityEn}
                    onChange={(e) => set("eligibilityEn", e.target.value)}
                    placeholder={"All pregnant women delivering in public health institutions\nNo income limit or BPL condition"}
                  />
                  <span className="textarea-hint">One point per line</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Documents Required (English)<span className="required">*</span></label>
                  <textarea
                    className="form-textarea"
                    value={form.documentsEn}
                    onChange={(e) => set("documentsEn", e.target.value)}
                    placeholder={"Aadhaar card or government-approved photo ID\nRation card"}
                  />
                  <span className="textarea-hint">One document per line</span>
                </div>
              </>
            ) : (
              <>
                <div className="form-group mb-4">
                  <label className="form-label">पात्रता बिंदु (हिंदी)</label>
                  <textarea
                    className="form-textarea"
                    value={form.eligibilityHi}
                    onChange={(e) => set("eligibilityHi", e.target.value)}
                    placeholder={"सरकारी स्वास्थ्य सुविधाओं में प्रसव कराने वाली सभी गर्भवती महिलाएं"}
                  />
                  <span className="textarea-hint">प्रति पंक्ति एक बिंदु</span>
                </div>
                <div className="form-group">
                  <label className="form-label">आवश्यक दस्तावेज़ (हिंदी)</label>
                  <textarea
                    className="form-textarea"
                    value={form.documentsHi}
                    onChange={(e) => set("documentsHi", e.target.value)}
                    placeholder={"आधार कार्ड\nराशन कार्ड"}
                  />
                  <span className="textarea-hint">प्रति पंक्ति एक दस्तावेज़</span>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-purple" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-gold">
              {mode === "edit" ? "Update Scheme" : "Save Scheme"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GovtSchemes({ schemes, setSchemes, isAdmin, toast }) {
  // modal = { scheme, type: 'eligibility' | 'documents' } | null
  const [modal, setModal] = useState(null);
  const [lang, setLang] = useState("en");
  const [formModal, setFormModal] = useState(null); // { mode: 'add' | 'edit', scheme } | null
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openModal = (scheme, type) => {
    setLang("en");
    setModal({ scheme, type });
  };
  const closeModal = () => setModal(null);

  const isEligibility = modal?.type === "eligibility";
  const listData = modal ? (isEligibility ? modal.scheme.eligibility : modal.scheme.documents)[lang] : [];

  const openAddForm  = () => setFormModal({ mode: "add", scheme: null });
  const openEditForm = (scheme) => setFormModal({ mode: "edit", scheme });
  const closeForm    = () => setFormModal(null);

  const handleFormSubmit = (scheme) => {
    if (formModal.mode === "edit") {
      setSchemes((prev) => prev.map((s) => (s.id === scheme.id ? scheme : s)));
      toast?.("Scheme updated successfully!", "success", scheme.name);
    } else {
      setSchemes((prev) => [...prev, scheme]);
      toast?.("Scheme added successfully!", "success", scheme.name);
    }
    setFormModal(null);
  };

  const requestDelete = (scheme) => setDeleteTarget(scheme);
  const cancelDelete  = () => setDeleteTarget(null);
  const confirmDeleteScheme = () => {
    setSchemes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    toast?.("Scheme deleted", "success", deleteTarget.name);
    setDeleteTarget(null);
  };

  return (
    <div className="page-body">
      <div className="card card-ai mb-4">
        <div className="card-header">
          <div className="card-title">🏛️ Govt Scheme Suggestions</div>
          <div className="flex items-center gap-2">
            <span className="badge badge-gold">{schemes.length} Schemes</span>
            {isAdmin && (
              <button className="btn btn-gold btn-sm" onClick={openAddForm}>
                ➕ Add New Scheme
              </button>
            )}
          </div>
        </div>
        <div className="card-body" style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 24px" }}>
          {isAdmin
            ? "National health schemes your patients may be eligible for — add, edit or remove schemes for everyone to see."
            : "National health schemes you may be eligible for — tap a card to see eligibility and required documents."}
        </div>
      </div>

      <div className="stats-grid">
        {schemes.map((s) => (
          <div key={s.id} className="stat-card">
            <div style={{ fontSize: 26 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, color: "var(--text-dark)", fontSize: 14, lineHeight: 1.3 }}>
              {s.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.desc}</div>
            <div style={{ fontSize: 11, color: "var(--purple-primary)", fontWeight: 600 }}>
              Eligibility: {s.eligibilitySummary}
            </div>
            <div className="scheme-card-actions">
              <button
                className="btn btn-outline-purple btn-sm"
                onClick={() => openModal(s, "eligibility")}
              >
                📋 Eligibility
              </button>
              <button
                className="btn btn-outline-gold btn-sm"
                onClick={() => openModal(s, "documents")}
              >
                📄 Document Required
              </button>
            </div>
            {isAdmin && (
              <div className="scheme-card-admin-row">
                <button className="btn btn-outline-purple btn-sm" onClick={() => openEditForm(s)}>
                  ✏️ Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => requestDelete(s)}>
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        ))}

        {schemes.length === 0 && (
          <div className="text-muted text-sm" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px 0" }}>
            No schemes added yet{isAdmin ? ' — click "Add New Scheme" to create one.' : "."}
          </div>
        )}
      </div>

      {/* Eligibility / Document Required modal — bilingual (EN / HI), view-only */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {modal.scheme.icon} {modal.scheme.name}
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--purple-mid)", marginTop: 2 }}>
                  {isEligibility ? "Eligibility Criteria / पात्रता मानदंड" : "Document Required / आवश्यक दस्तावेज़"}
                </span>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body">
              <div className="btn-tabs lang-toggle-row">
                <button
                  className={`btn-tab ${lang === "en" ? "active" : ""}`}
                  onClick={() => setLang("en")}
                >
                  English
                </button>
                <button
                  className={`btn-tab ${lang === "hi" ? "active" : ""}`}
                  onClick={() => setLang("hi")}
                >
                  हिंदी
                </button>
              </div>

              {isEligibility && (
                <div className="scheme-links">
                  <a href={modal.scheme.officialLink} target="_blank" rel="noopener noreferrer" className="scheme-link-pill">
                    🌐 {lang === "en" ? "Official Website" : "आधिकारिक वेबसाइट"}
                  </a>
                  <a href={modal.scheme.detailLink} target="_blank" rel="noopener noreferrer" className="scheme-link-pill">
                    🔗 {lang === "en" ? "Detailed Eligibility Criteria" : "विस्तृत पात्रता मानदंड"}
                  </a>
                </div>
              )}

              <ul className="scheme-list">
                {listData.map((point, i) => (
                  <li key={i} className="scheme-list-item">{point}</li>
                ))}
              </ul>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline-purple" onClick={closeModal}>
                {lang === "en" ? "Close" : "बंद करें"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit scheme modal — admin only */}
      {formModal && (
        <SchemeFormModal
          mode={formModal.mode}
          initial={formModal.scheme}
          onCancel={closeForm}
          onSubmit={handleFormSubmit}
        />
      )}

      {/* Delete confirmation modal — admin only */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🗑️ Delete Scheme</div>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              This will remove it from both the admin and patient views. This action cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-purple" onClick={cancelDelete}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteScheme}>Delete Scheme</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Medical Analysis — OCR + AI Document Reader ─────────────────────────────
// Pipeline: image → OCR (Tesseract.js, on-device) → extracted text shown to
// the user → ONLY that text (never the image) is sent to the AI for a short,
// structured summary. This keeps token usage low and matches the "OCR first,
// AI only when required" rule from the feature spec.

// Tesseract.js is loaded from a CDN on first use instead of being bundled, so
// no new dependency/file is needed — it attaches itself to `window.Tesseract`.
//
// Because it's loaded via a plain <script> tag (not npm/webpack), Tesseract.js
// can't auto-resolve its own worker/core/lang file locations the way it would
// in a bundled app — so we point it at the CDN explicitly. NOTE: corePath must
// be a *directory* containing all 4 core build variants (lstm/simd/legacy) —
// pointing it at one specific .js file stops Tesseract from picking the right
// build for the user's device and is the actual reason OCR was failing.
const TESSERACT_CDN = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  corePath:   "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0",
  langPath:   "https://tessdata.projectnaptha.com/4.0.0",
};

function loadTesseract() {
  if (typeof window !== "undefined" && window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }
  if (!loadTesseract._promise) {
    loadTesseract._promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () =>
        reject(new Error("Couldn't load the OCR engine. Check your internet connection and try again."));
      document.head.appendChild(script);
    });
  }
  return loadTesseract._promise;
}

// ── Expiry detection (Medicine Pack) — pure pattern matching, no AI call ────
const MONTH_MAP = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function buildExpiryResult(month, year, day) {
  if (!month || month < 1 || month > 12) return null;
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2099) return null;

  // A pack is treated as valid through the end of the printed day/month.
  const expiryDate = day
    ? new Date(year, month - 1, day, 23, 59, 59)
    : new Date(year, month, 0, 23, 59, 59);
  if (isNaN(expiryDate.getTime())) return null;

  const daysRemaining = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
  const dateLabel = day
    ? `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
    : `${String(month).padStart(2, "0")}/${year}`;

  return { dateLabel, status: daysRemaining >= 0 ? "Valid" : "Expired", daysRemaining };
}

function parseExpiryFromText(rawText) {
  const text = rawText.toUpperCase().replace(/\s+/g, " ");
  const keyword = "(?:EXP(?:IRY)?(?:\\.|\\s*DATE)?|USE\\s*BY|BEST\\s*BEFORE)\\s*[:.\\-]?\\s*";

  // Numeric forms: "EXP 06/2027", "EXPIRY: 25-06-2027"
  // NOTE: the middle group tries \d{4} BEFORE \d{1,2}. Regex alternation tries
  // left-to-right and stops at the first option that lets the match succeed —
  // with \d{1,2} listed first, "2027" would match only its first 2 digits
  // ("20"), which then got promoted via the year<100 rule below into 2020 —
  // i.e. almost every real-world MM/YYYY expiry in the 2020s was silently
  // misread as "2020", which is why every pack looked "Expired" the same way.
  const numeric = text.match(new RegExp(keyword + "(\\d{1,2})[\\/\\-.](\\d{4}|\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?"));
  if (numeric) {
    const result = numeric[3]
      ? buildExpiryResult(parseInt(numeric[2], 10), parseInt(numeric[3], 10), parseInt(numeric[1], 10))
      : buildExpiryResult(parseInt(numeric[1], 10), parseInt(numeric[2], 10), null);
    if (result) return result;
  }

  // Textual-month forms: "EXP JUN 2027", "EXPIRY: JUN-27"
  const textual = text.match(new RegExp(keyword + "([A-Z]{3,9})[\\s\\-.]?(\\d{2,4})"));
  if (textual && MONTH_MAP[textual[1].slice(0, 3)]) {
    const result = buildExpiryResult(MONTH_MAP[textual[1].slice(0, 3)], parseInt(textual[2], 10), null);
    if (result) return result;
  }

  return null;
}

// ── Small helpers ───────────────────────────────────────────────────────────
function hashText(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h.toString(36);
}

async function analyzeDocumentWithAI(systemPrompt, ocrText) {
  const { response } = await analyzeMedicalDocument(systemPrompt, ocrText);
  if (!response) throw new Error("The AI didn't return a usable response. Please try again.");
  return response;
}

// ── Per-document-type configuration ─────────────────────────────────────────
const ANALYSIS_TYPES = {
  prescription: {
    key: "prescription",
    icon: "💊",
    title: "Doctor Prescription",
    desc: "Upload a doctor's handwritten or printed prescription and get a structured summary.",
    uploadLabel: "Upload Prescription",
    accent: "purple",
    systemPrompt: `You are a careful medical-document assistant helping an ASHA health worker in India read a doctor's prescription. You will be given OCR-extracted text from a prescription photo — it may contain OCR mistakes or be incomplete.

Reply in PLAIN TEXT ONLY (no markdown asterisks, no numbered lists) using EXACTLY this structure, and keep the whole reply under 300 words:

Doctor:
<name, or "Not detected">

Patient:
<name, or "Not detected">

Medicines Prescribed:
- <medicine 1>
- <medicine 2>

Dosage Instructions:
- <instruction>

Important Notes:
- <note>

Warnings:
- This is AI-generated and must be verified by a healthcare professional.

If a field cannot be read from the OCR text, write "Not detected" rather than guessing.`,
  },
  lab: {
    key: "lab",
    icon: "🧪",
    title: "Lab Report",
    desc: "Upload blood test, urine test, thyroid report, CBC, sugar report, etc.",
    uploadLabel: "Upload Lab Report",
    accent: "gold",
    systemPrompt: `You are a careful lab-report analysis assistant helping an ASHA health worker in India interpret a patient's lab report. You will be given OCR-extracted text from a lab report photo — it may contain OCR mistakes or be incomplete.

Reply in PLAIN TEXT ONLY (no markdown asterisks, no numbered lists) using EXACTLY this structure, and keep the whole reply under 300 words:

Normal Parameters:
- <parameter: value>

Abnormal Parameters:
- <parameter: value>

Possible Health Concerns:
- <concern>

Lifestyle Recommendations:
- <recommendation>

Suggested Questions For Doctor:
- <question>

Risk Level:
<Low, Medium, or High>

Medical Disclaimer:
This analysis is informational only and is not a medical diagnosis.

If a section has nothing to report, write "None detected" instead of leaving it blank.`,
  },
  medicine: {
    key: "medicine",
    icon: "💉",
    title: "Medicine Pack",
    desc: "Upload a medicine strip, bottle, or box image to identify medicine details.",
    uploadLabel: "Upload Medicine",
    accent: "green",
    systemPrompt: `You are a careful medicine-identification assistant helping an ASHA health worker in India read a medicine strip, bottle, or box. You will be given OCR-extracted text from the packaging — it may contain OCR mistakes or be incomplete.

Reply in PLAIN TEXT ONLY (no markdown asterisks, no numbered lists) using EXACTLY this structure, and keep the whole reply under 300 words:

Medicine Name:
<name, or "Not detected">

Medicine Type:
<Tablet, Syrup, Capsule, Injection, or Other>

Common Uses:
- <use>

How To Use:
- <instruction>

Possible Side Effects:
- <side effect>

Storage Instructions:
- <instruction>

Important Warnings:
- <warning>

Medical Disclaimer:
Consult a healthcare professional before taking any medicine.

Do not comment on the expiry date — that is calculated separately and shown above your summary.`,
  },
};

// ── Renders the AI's structured plain-text reply with light formatting ─────
function riskBadgeClass(value) {
  const v = value.toLowerCase();
  if (v.includes("high")) return "badge-red";
  if (v.includes("medium")) return "badge-gold";
  if (v.includes("low")) return "badge-green";
  return "badge-purple";
}

function AnalysisOutput({ text }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="analysis-output">
      {lines.map((line, i) => {
        const headerOnly = line.match(/^([A-Za-z][A-Za-z /&]{2,40}):$/);
        if (headerOnly) {
          return <div key={i} className="analysis-heading">{headerOnly[1]}</div>;
        }
        const bullet = line.match(/^[-•]\s*(.+)$/);
        if (bullet) {
          return <div key={i} className="analysis-bullet">• {bullet[1]}</div>;
        }
        const kv = line.match(/^([A-Za-z][A-Za-z /&]{2,40}):\s*(.+)$/);
        if (kv) {
          const label = kv[1];
          const value = kv[2];
          const isRisk = /risk level/i.test(label);
          return (
            <div key={i} className="analysis-kv">
              <span className="analysis-kv-label">{label}:</span>{" "}
              {isRisk ? (
                <span className={`badge ${riskBadgeClass(value)}`}>{value}</span>
              ) : (
                <span className="analysis-kv-value">{value}</span>
              )}
            </div>
          );
        }
        return <div key={i} className="analysis-line">{line}</div>;
      })}
    </div>
  );
}

// ── Upload + OCR + AI flow for a single document type ──────────────────────
function MedicalUploadCard({ meta, onBack, cache, setCache }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus]   = useState("idle"); // idle | ocr | analyzing | done | error
  const [ocrText, setOcrText] = useState("");
  const [ocrPct, setOcrPct]   = useState(0);
  const [showOcr, setShowOcr] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [expiry, setExpiry]   = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const galleryInputRef = useRef(null);
  const cameraInputRef  = useRef(null);

  const acceptFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErrorMsg("Please upload an image file (JPG or PNG).");
      setStatus("error");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setErrorMsg("That image is larger than 8 MB. Please upload a smaller photo.");
      setStatus("error");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus("idle");
    setOcrText(""); setAnalysis(""); setExpiry(null); setErrorMsg(""); setFromCache(false);
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setStatus("idle");
    setOcrText(""); setOcrPct(0); setAnalysis(""); setExpiry(null);
    setErrorMsg(""); setFromCache(false); setShowOcr(false);
  };

  const runAnalysis = async () => {
    if (!file) return;
    setErrorMsg(""); setFromCache(false);
    try {
      // 1) OCR runs first, on-device — this is the only thing that "looks" at the image
      setStatus("ocr"); setOcrPct(0);
      const Tesseract = await loadTesseract();
      const worker = await Tesseract.createWorker("eng", 1, {
        ...TESSERACT_CDN,
        logger: (m) => {
          if (m.status === "recognizing text") setOcrPct(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const text = (data?.text || "").trim();
      setOcrText(text);

      if (!text) {
        throw new Error("Couldn't read any text from this image. Try a clearer, well-lit photo.");
      }

      // 2) Medicine packs: expiry is detected straight from OCR text, no AI needed
      if (meta.key === "medicine") {
        setExpiry(parseExpiryFromText(text));
      }

      // 3) Re-use a cached AI summary for identical text instead of calling the AI again.
      // TODO: back this with Firestore (medical_reports / medicine_cache / lab_reports /
      // prescriptions collections, as in the spec) once Firebase is wired into this app —
      // this in-memory cache only lasts the current session.
      const cacheKey = `${meta.key}:${hashText(text)}`;
      if (cache[cacheKey]) {
        setAnalysis(cache[cacheKey]);
        setFromCache(true);
        setStatus("done");
        return;
      }

      // 4) Only the extracted TEXT is sent to the AI — never the image — to keep cost low
      setStatus("analyzing");
      const result = await analyzeDocumentWithAI(meta.systemPrompt, text);
      setAnalysis(result);
      setCache((prev) => ({ ...prev, [cacheKey]: result }));
      setStatus("done");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="page-body">
      <div className="medical-type-header">
        <button className="btn btn-outline-purple btn-sm" onClick={onBack}>← Back</button>
        <div className="medical-type-heading">
          <span style={{ fontSize: 28 }}>{meta.icon}</span>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>{meta.title}</div>
            <div className="text-sm text-muted">{meta.desc}</div>
          </div>
        </div>
      </div>

      <div className="card card-ai">
        <div className="card-body">
          {!file && (
            <div
              className={`upload-zone ${dragOver ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                acceptFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              <div className="upload-icon">{meta.icon}</div>
              <div className="upload-title">{meta.uploadLabel}</div>
              <div className="upload-sub">Drag a photo here, or choose an option below · JPG or PNG</div>
              <div className="flex gap-2 mt-2" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline-purple btn-sm"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  🖼️ Upload Document
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  📷 Take Photo
                </button>
              </div>
            </div>
          )}

          {errorMsg && status === "error" && !file && (
            <div className="error-banner mt-2">⚠️ {errorMsg}</div>
          )}

          {file && (
            <div className="medical-upload-active">
              <div className="medical-preview-row">
                <img src={preview} alt="Uploaded document" className="medical-preview-thumb" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text-dark)" }} className="truncate">{file.name}</div>
                  <div className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB</div>
                  {status === "idle" && (
                    <div className="flex gap-2 mt-2" style={{ flexWrap: "wrap" }}>
                      <button className="btn btn-gold btn-sm" onClick={runAnalysis}>🔍 Run Analysis</button>
                      <button className="btn btn-outline-purple btn-sm" onClick={reset}>Choose Different Image</button>
                    </div>
                  )}
                </div>
              </div>

              {(status === "ocr" || status === "analyzing") && (
                <div className="medical-progress">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="spinner"
                      style={{ borderColor: "rgba(124,58,237,0.25)", borderTopColor: "var(--purple-primary)", width: 16, height: 16 }}
                    />
                    <span className="text-sm" style={{ color: "var(--purple-deep)", fontWeight: 600 }}>
                      {status === "ocr" ? "Reading text from the image…" : "Analyzing with AI…"}
                    </span>
                  </div>
                  {status === "ocr" && (
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${ocrPct}%` }} />
                    </div>
                  )}
                </div>
              )}

              {errorMsg && status === "error" && (
                <div className="error-banner mt-2">
                  ⚠️ {errorMsg}
                  <div className="mt-2">
                    <button className="btn btn-outline-purple btn-sm" onClick={runAnalysis}>Try Again</button>
                  </div>
                </div>
              )}

              {ocrText && (
                <div className="ocr-text-block">
                  <button className="ocr-text-toggle" onClick={() => setShowOcr((p) => !p)}>
                    {showOcr ? "▾" : "▸"} Extracted Text (OCR)
                  </button>
                  {showOcr && <div className="ocr-text-box">{ocrText}</div>}
                </div>
              )}

              {meta.key === "medicine" && expiry && (
                <div className={`expiry-banner ${expiry.status === "Valid" ? "valid" : "expired"}`}>
                  <div style={{ fontSize: 22 }}>{expiry.status === "Valid" ? "✅" : "⛔"}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Medicine Status: {expiry.status}</div>
                    <div className="text-sm">
                      Expiry detected: {expiry.dateLabel} ·{" "}
                      {expiry.daysRemaining >= 0
                        ? `${expiry.daysRemaining} day(s) remaining`
                        : `Expired ${Math.abs(expiry.daysRemaining)} day(s) ago`}
                    </div>
                  </div>
                </div>
              )}
              {meta.key === "medicine" && (status === "analyzing" || status === "done") && !expiry && (
                <div className="expiry-banner unknown">
                  <div style={{ fontSize: 22 }}>❔</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>Expiry date not detected</div>
                    <div className="text-sm">Try a clearer photo of the expiry print, or check it manually.</div>
                  </div>
                </div>
              )}

              {analysis && (
                <div className="card mt-4">
                  <div className="card-header">
                    <div className="card-title">📝 AI Summary</div>
                    {fromCache && <span className="badge badge-green">⚡ From cache · no AI call needed</span>}
                  </div>
                  <div className="card-body">
                    <AnalysisOutput text={analysis} />
                    <div className="mt-4">
                      <button className="btn btn-outline-purple btn-sm" onClick={reset}>
                        Analyze Another {meta.title}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Top-level page: three feature cards, or the upload flow for one of them ─
function MedicalAnalysis() {
  const [activeType, setActiveType] = useState(null); // null | "prescription" | "lab" | "medicine"
  const [cache, setCache] = useState({}); // AI-result cache for this session, keyed by type+text hash

  if (activeType) {
    return (
      <MedicalUploadCard
        key={activeType}
        meta={ANALYSIS_TYPES[activeType]}
        onBack={() => setActiveType(null)}
        cache={cache}
        setCache={setCache}
      />
    );
  }

  return (
    <div className="page-body">
      <div className="card card-ai mb-4">
        <div className="card-header">
          <div className="card-title">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <ClipboardLogoIcon size={22} />
              Medical Analysis
            </span>
            <span className="ai-badge">✨ OCR + AI Analysis</span>
          </div>
        </div>
        <div className="card-body" style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 24px" }}>
          Upload a photo of a prescription, lab report, or medicine pack. Text is read on-device with OCR
          first — only that text, never the image, is sent to AI for a short, structured summary.
        </div>
      </div>

      <div className="feature-grid">
        {Object.values(ANALYSIS_TYPES).map((t) => (
          <div key={t.key} className={`feature-card feature-card-${t.accent}`}>
            <div className="feature-icon-circle">{t.icon}</div>
            <div className="feature-title">{t.title}</div>
            <div className="feature-desc">{t.desc}</div>
            <button className="btn btn-gold" onClick={() => setActiveType(t.key)}>
              {t.uploadLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Patient Profile (Admin/ASHA view, with trackable history) ───────────────
// ─── Patient History & Tracking — bilingual UI text ──────────────────────────
const HISTORY_UI_TEXT = {
  en: {
    title: "📈 Patient History & Tracking",
    addBtn: "➕ Add Checkup",
    records: "Records",
    empty: "No visit history recorded yet.",
    emptyAdmin: ' — click "Add Checkup" to record one.',
    edit: "✏️ Edit",
    delete: "🗑️ Delete",
    alert: "⚠️ Health Alert",
    precaution: "💡 Precaution",
    deleteTitle: "🗑️ Delete Checkup Record",
    deleteBody: "Are you sure you want to delete this checkup record? This action cannot be undone.",
    cancel: "Cancel",
    confirmDelete: "Delete Record",
  },
  hi: {
    title: "📈 रोगी इतिहास और ट्रैकिंग",
    addBtn: "➕ नई जांच जोड़ें",
    records: "रिकॉर्ड",
    empty: "अभी तक कोई विज़िट इतिहास दर्ज नहीं है।",
    emptyAdmin: ' — एक जोड़ने के लिए "नई जांच जोड़ें" पर क्लिक करें।',
    edit: "✏️ संपादित करें",
    delete: "🗑️ हटाएं",
    alert: "⚠️ स्वास्थ्य चेतावनी",
    precaution: "💡 सावधानी",
    deleteTitle: "🗑️ जांच रिकॉर्ड हटाएं",
    deleteBody: "क्या आप वाकई इस जांच रिकॉर्ड को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।",
    cancel: "रद्द करें",
    confirmDelete: "रिकॉर्ड हटाएं",
  },
};

const VITAL_LABELS = {
  bp:          { en: "BP",     hi: "बीपी" },
  sugar:       { en: "Sugar",  hi: "शुगर" },
  weight:      { en: "Weight", hi: "वज़न" },
  temperature: { en: "Temp",   hi: "तापमान" },
  pulse:       { en: "Pulse",  hi: "पल्स" },
  spo2:        { en: "SpO2",   hi: "ऑक्सीजन" },
};

// Common ASHA / NHM visit categories, offered as a quick-pick in the form —
// admin can still freely edit the bilingual text after picking one.
const COMMON_VISIT_TYPES = [
  { en: "Registration Checkup",        hi: "पंजीकरण जांच" },
  { en: "Follow-up Checkup",           hi: "अनुवर्ती जांच" },
  { en: "Routine Checkup",             hi: "नियमित जांच" },
  { en: "Antenatal Checkup (ANC)",     hi: "प्रसवपूर्व जांच (ANC)" },
  { en: "Postnatal Checkup (PNC)",     hi: "प्रसवोत्तर जांच (PNC)" },
  { en: "Immunization Visit",          hi: "टीकाकरण विज़िट" },
  { en: "Disease Screening",           hi: "रोग जांच" },
  { en: "BP Monitoring",               hi: "रक्तचाप निगरानी" },
  { en: "Diabetes Screening",          hi: "मधुमेह जांच" },
  { en: "Home Visit",                  hi: "गृह भ्रमण" },
];

const BLANK_HISTORY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  worker: "",
  typeEn: "", typeHi: "",
  noteEn: "", noteHi: "",
  alertEn: "", alertHi: "",
  precautionEn: "", precautionHi: "",
  bp: "", sugar: "", weight: "", temperature: "", pulse: "", spo2: "",
};

function recordToForm(r) {
  return {
    date: r.date || new Date().toISOString().slice(0, 10),
    worker: r.worker || "",
    typeEn: r.type?.en || "", typeHi: r.type?.hi || "",
    noteEn: r.note?.en || "", noteHi: r.note?.hi || "",
    alertEn: r.healthAlert?.en || "", alertHi: r.healthAlert?.hi || "",
    precautionEn: r.precaution?.en || "", precautionHi: r.precaution?.hi || "",
    bp: r.bp || "", sugar: r.sugar || "", weight: r.weight || "",
    temperature: r.temperature || "", pulse: r.pulse || "", spo2: r.spo2 || "",
  };
}

function formToHistoryRecord(form, existingId) {
  return {
    id: existingId || `h-${Date.now()}`,
    date: form.date,
    worker: form.worker.trim(),
    type: { en: form.typeEn.trim(), hi: form.typeHi.trim() },
    note: { en: form.noteEn.trim(), hi: form.noteHi.trim() },
    healthAlert: { en: form.alertEn.trim(), hi: form.alertHi.trim() },
    precaution: { en: form.precautionEn.trim(), hi: form.precautionHi.trim() },
    bp: form.bp.trim(), sugar: form.sugar.trim(), weight: form.weight.trim(),
    temperature: form.temperature.trim(), pulse: form.pulse.trim(), spo2: form.spo2.trim(),
  };
}

// ─── Add / Edit Checkup form modal (admin / ASHA worker only) ────────────────
function HistoryFormModal({ mode, initial, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => (initial ? recordToForm(initial) : BLANK_HISTORY_FORM));
  const [formLang, setFormLang] = useState("en");
  const [error, setError] = useState("");

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const applyPreset = (e) => {
    const preset = COMMON_VISIT_TYPES.find((t) => t.en === e.target.value);
    if (preset) setForm((f) => ({ ...f, typeEn: preset.en, typeHi: preset.hi }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.date || !form.worker.trim()) {
      setError("Date and Doctor / ASHA Name are required.");
      return;
    }
    if (!form.typeEn.trim() || !form.noteEn.trim()) {
      setError("Visit Type and Reason / Notes (English) are required.");
      return;
    }
    setError("");
    onSubmit(formToHistoryRecord(form, initial?.id));
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {mode === "edit" ? "✏️ Edit Checkup Record" : "➕ Add New Checkup Record"}
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">⚠️ {error}</div>}

            <div className="form-grid mb-4">
              <div className="form-group">
                <label className="form-label">Date<span className="required">*</span></label>
                <input
                  className="form-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Doctor / ASHA Name<span className="required">*</span></label>
                <input
                  className="form-input"
                  value={form.worker}
                  onChange={(e) => set("worker", e.target.value)}
                  placeholder="e.g. Asha Devi (ASHA Worker) or Dr. Sunita Rao"
                />
              </div>
            </div>

            <div className="form-group mb-4">
              <label className="form-label">Quick Pick Visit Type (optional)</label>
              <select className="form-select" defaultValue="" onChange={applyPreset}>
                <option value="">— Select a common visit type —</option>
                {COMMON_VISIT_TYPES.map((t) => (
                  <option key={t.en} value={t.en}>{t.en}</option>
                ))}
              </select>
            </div>

            <div className="form-section-title">📝 Visit Details</div>

            <div className="btn-tabs lang-toggle-row">
              <button type="button" className={`btn-tab ${formLang === "en" ? "active" : ""}`} onClick={() => setFormLang("en")}>
                English
              </button>
              <button type="button" className={`btn-tab ${formLang === "hi" ? "active" : ""}`} onClick={() => setFormLang("hi")}>
                हिंदी
              </button>
            </div>

            {formLang === "en" ? (
              <>
                <div className="form-group mb-4">
                  <label className="form-label">Visit Type (English)<span className="required">*</span></label>
                  <input
                    className="form-input"
                    value={form.typeEn}
                    onChange={(e) => set("typeEn", e.target.value)}
                    placeholder="e.g. Follow-up Checkup"
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">Reason / Clinical Notes (English)<span className="required">*</span></label>
                  <textarea
                    className="form-textarea"
                    value={form.noteEn}
                    onChange={(e) => set("noteEn", e.target.value)}
                    placeholder="Reason for visit and observations"
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">Health Alert (English, optional)</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 56 }}
                    value={form.alertEn}
                    onChange={(e) => set("alertEn", e.target.value)}
                    placeholder="Anything that needs urgent attention"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Precaution / Advice (English, optional)</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 56 }}
                    value={form.precautionEn}
                    onChange={(e) => set("precautionEn", e.target.value)}
                    placeholder="Advice given to the patient"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group mb-4">
                  <label className="form-label">विज़िट प्रकार (हिंदी)</label>
                  <input
                    className="form-input"
                    value={form.typeHi}
                    onChange={(e) => set("typeHi", e.target.value)}
                    placeholder="जैसे अनुवर्ती जांच"
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">कारण / टिप्पणी (हिंदी)</label>
                  <textarea
                    className="form-textarea"
                    value={form.noteHi}
                    onChange={(e) => set("noteHi", e.target.value)}
                    placeholder="विज़िट का कारण और अवलोकन"
                  />
                </div>
                <div className="form-group mb-4">
                  <label className="form-label">स्वास्थ्य चेतावनी (हिंदी, वैकल्पिक)</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 56 }}
                    value={form.alertHi}
                    onChange={(e) => set("alertHi", e.target.value)}
                    placeholder="तुरंत ध्यान देने योग्य कोई बात"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">सावधानी / सलाह (हिंदी, वैकल्पिक)</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 56 }}
                    value={form.precautionHi}
                    onChange={(e) => set("precautionHi", e.target.value)}
                    placeholder="रोगी को दी गई सलाह"
                  />
                </div>
              </>
            )}

            <div className="form-section-title mt-4">🩺 Vitals</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Blood Pressure</label>
                <input className="form-input" value={form.bp} onChange={(e) => set("bp", e.target.value)} placeholder="e.g. 120/80" />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Sugar</label>
                <input className="form-input" value={form.sugar} onChange={(e) => set("sugar", e.target.value)} placeholder="e.g. 110 mg/dL" />
              </div>
              <div className="form-group">
                <label className="form-label">Weight</label>
                <input className="form-input" value={form.weight} onChange={(e) => set("weight", e.target.value)} placeholder="e.g. 60 kg" />
              </div>
              <div className="form-group">
                <label className="form-label">Temperature</label>
                <input className="form-input" value={form.temperature} onChange={(e) => set("temperature", e.target.value)} placeholder="e.g. 98.6°F" />
              </div>
              <div className="form-group">
                <label className="form-label">Pulse Rate</label>
                <input className="form-input" value={form.pulse} onChange={(e) => set("pulse", e.target.value)} placeholder="e.g. 76 bpm" />
              </div>
              <div className="form-group">
                <label className="form-label">SpO2</label>
                <input className="form-input" value={form.spo2} onChange={(e) => set("spo2", e.target.value)} placeholder="e.g. 98%" />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-purple" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-gold">
              {mode === "edit" ? "Update Record" : "Save Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Patient History & Tracking card ─────────────────────────────────────────
// Reused by the admin/ASHA "Patient Profile" view (full CRUD) and the
// patient's own "Health Records" page (read-only). `records` is the flat
// array for ONE patient; CRUD writes go through `setHistory`, which holds
// the full { [patientId]: records[] } map lifted at the App level so admin
// edits are immediately reflected in the patient's own view.
function PatientHistoryCard({ patientId, records, setHistory, isAdmin, toast }) {
  const [lang, setLang] = useState("en");
  const [formModal, setFormModal] = useState(null); // { mode: 'add' | 'edit', record } | null
  const [deleteTarget, setDeleteTarget] = useState(null);

  const T = HISTORY_UI_TEXT[lang];
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  const openAddForm  = () => setFormModal({ mode: "add", record: null });
  const openEditForm = (record) => setFormModal({ mode: "edit", record });
  const closeForm    = () => setFormModal(null);

  const upsertHistory = (patientId, updater) =>
    setHistory((prev) => ({ ...prev, [patientId]: updater(prev[patientId] || []) }));

  const handleFormSubmit = (record) => {
    if (formModal.mode === "edit") {
      upsertHistory(patientId, (list) => list.map((r) => (r.id === record.id ? record : r)));
      toast?.("Checkup record updated!", "success", record.type.en);
    } else {
      upsertHistory(patientId, (list) => [record, ...list]);
      toast?.("Checkup record added!", "success", record.type.en);
    }
    setFormModal(null);
  };

  const requestDelete = (record) => setDeleteTarget(record);
  const cancelDelete  = () => setDeleteTarget(null);
  const confirmDeleteRecord = () => {
    upsertHistory(patientId, (list) => list.filter((r) => r.id !== deleteTarget.id));
    toast?.("Checkup record deleted", "success", deleteTarget.type.en);
    setDeleteTarget(null);
  };

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="card-title">{T.title}</div>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <div className="btn-tabs btn-tabs-compact" title="Switch language / भाषा बदलें">
            <button type="button" className={`btn-tab ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>EN</button>
            <button type="button" className={`btn-tab ${lang === "hi" ? "active" : ""}`} onClick={() => setLang("hi")}>हिं</button>
          </div>
          <span className="badge badge-gold">{records.length} {T.records}</span>
          {isAdmin && (
            <button className="btn btn-gold btn-sm" onClick={openAddForm}>{T.addBtn}</button>
          )}
        </div>
      </div>

      <div className="card-body">
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
            {T.empty}{isAdmin ? T.emptyAdmin : ""}
          </div>
        ) : (
          sorted.map((r) => (
            <div className="history-item" key={r.id}>
              <div className="history-item-icon">🩺</div>
              <div className="history-item-body">
                <div className="history-item-top">
                  <div>
                    <div className="history-item-title">{r.type?.[lang] || r.type?.en}</div>
                    <div className="history-item-meta">{r.worker} · {r.date}</div>
                  </div>
                  {isAdmin && (
                    <div className="history-item-actions">
                      <button className="btn btn-outline-purple btn-sm" onClick={() => openEditForm(r)}>{T.edit}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => requestDelete(r)}>{T.delete}</button>
                    </div>
                  )}
                </div>

                {(r.note?.[lang] || r.note?.en) && (
                  <div className="history-item-note">{r.note[lang] || r.note.en}</div>
                )}

                {(r.healthAlert?.[lang] || r.healthAlert?.en) && (
                  <div className="health-alert-banner">{T.alert}: {r.healthAlert[lang] || r.healthAlert.en}</div>
                )}
                {(r.precaution?.[lang] || r.precaution?.en) && (
                  <div className="precaution-banner">{T.precaution}: {r.precaution[lang] || r.precaution.en}</div>
                )}

                <div className="flex gap-2" style={{ flexWrap: "wrap", marginTop: 8 }}>
                  {r.bp && <span className="badge badge-purple">{VITAL_LABELS.bp[lang]} {r.bp}</span>}
                  {r.sugar && r.sugar !== "—" && <span className="badge badge-gold">{VITAL_LABELS.sugar[lang]} {r.sugar}</span>}
                  {r.weight && <span className="badge badge-green">{VITAL_LABELS.weight[lang]} {r.weight}</span>}
                  {r.temperature && <span className="badge badge-blue">{VITAL_LABELS.temperature[lang]} {r.temperature}</span>}
                  {r.pulse && <span className="badge badge-purple">{VITAL_LABELS.pulse[lang]} {r.pulse}</span>}
                  {r.spo2 && <span className="badge badge-teal">{VITAL_LABELS.spo2[lang]} {r.spo2}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit checkup modal — admin / ASHA worker only */}
      {formModal && (
        <HistoryFormModal
          mode={formModal.mode}
          initial={formModal.record}
          onCancel={closeForm}
          onSubmit={handleFormSubmit}
        />
      )}

      {/* Delete confirmation modal — admin / ASHA worker only */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{T.deleteTitle}</div>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">{T.deleteBody}</div>
            <div className="modal-footer">
              <button className="btn btn-outline-purple" onClick={cancelDelete}>{T.cancel}</button>
              <button className="btn btn-danger" onClick={confirmDeleteRecord}>{T.confirmDelete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PatientProfileView({ patient, history, setHistory, isAdmin, toast, onBack, onEdit }) {
  if (!patient) {
    return (
      <div className="page-body">
        <div className="card"><div className="card-body">Patient not found.</div></div>
      </div>
    );
  }

  const records = history[patient.id] || [];
  const lastVisit = records[0]?.date || patient.registered;

  return (
    <div className="page-body">
      {/* Back / Edit actions */}
      <div className="flex items-center gap-3 mb-4" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-outline-purple btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-gold btn-sm" onClick={() => onEdit(patient)}>✏️ Edit Patient</button>
      </div>

      {/* Profile Header */}
      <div className="profile-header mb-6">
        <div className="profile-avatar">{patient.name[0]}</div>
        <div>
          <div className="profile-name">{patient.name}</div>
          <div className="profile-role">Patient ID: {patient.id}</div>
          <div className="profile-meta">
            <div className="profile-meta-item">🩸 {patient.blood}</div>
            <div className="profile-meta-item">👤 {patient.gender}, {patient.age} yrs</div>
            <div className="profile-meta-item">📍 {patient.village}</div>
            <div className="profile-meta-item">📞 {patient.mobile}</div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="stats-grid mb-6">
        <div className="stat-card gold">
          <div className="stat-icon">🩸</div>
          <div className="stat-label">Blood Group</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{patient.blood}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon">📋</div>
          <div className="stat-label">Total Visits</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{records.length}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">✅</div>
          <div className="stat-label">Last Visit</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{lastVisit}</div>
        </div>
        <div className="stat-card pink">
          <div className="stat-icon">💊</div>
          <div className="stat-label">Active Conditions</div>
          <div className="stat-value">{patient.diseases === "None" ? 0 : 1}</div>
        </div>
      </div>

      {/* Health Info */}
      <div className="card card-ai mb-6">
        <div className="card-header">
          <div className="card-title-hi">स्वास्थ्य जानकारी</div>
        </div>
        <div className="card-body">
          <div className="form-grid">
            {[
              ["Full Name",   patient.name],
              ["Age",         `${patient.age} years`],
              ["Gender",      patient.gender],
              ["Blood Group", patient.blood],
              ["Mobile",      patient.mobile],
              ["Email",       patient.email],
              ["Village",     patient.village],
              ["State",       patient.state],
              ["Condition",   patient.diseases],
              ["Registered",  patient.registered],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="form-label">{k}</div>
                <div style={{ fontWeight: 600, color: "var(--text-dark)", marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visit / Tracking History — full CRUD for admin/ASHA, bilingual EN/HI */}
      <PatientHistoryCard
        patientId={patient.id}
        records={records}
        setHistory={setHistory}
        isAdmin={isAdmin}
        toast={toast}
      />
    </div>
  );
}

// ─── ASHA Worker form helpers ────────────────────────────────────────────────
const BLANK_ASHA_FORM = { name: "", email: "", password: "", mobile: "", location: "" };

function ashaToForm(worker) {
  return {
    name: worker.name || "",
    email: worker.email || "",
    password: worker.password || "",
    mobile: worker.mobile || "",
    location: worker.location || "",
  };
}

function formToAsha(form, existingId, existingRegistered) {
  return {
    id: existingId || `ASHA-${Date.now()}`,
    name: form.name.trim(),
    email: form.email.trim(),
    password: form.password.trim(),
    mobile: form.mobile.trim(),
    location: form.location.trim(),
    registered: existingRegistered || new Date().toISOString().slice(0, 10),
  };
}

// ─── Add / Edit ASHA Worker modal (Admin only) ───────────────────────────────
function AshaFormModal({ mode, initial, existingWorkers, onCancel, onSubmit }) {
  const [form, setForm]       = useState(() => (initial ? ashaToForm(initial) : BLANK_ASHA_FORM));
  const [error, setError]     = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]   = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const passwordRequired = mode !== "edit"; // editing doesn't change the login password
    if (!form.name.trim() || !form.email.trim() || (passwordRequired && !form.password.trim()) || !form.mobile.trim() || !form.location.trim()) {
      setError("Name, email, password, mobile and location are all required.");
      return;
    }
    const emailLower = form.email.trim().toLowerCase();
    const clash = existingWorkers.some(
      (w) => w.email.toLowerCase() === emailLower && w.id !== initial?.id
    );
    if (clash) {
      setError("Another ASHA worker already uses this email.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      // onSubmit (in ManageAsha) actually hits the backend — awaiting here
      // keeps the modal open with an error message if that call fails,
      // instead of closing and silently losing the account.
      await onSubmit(formToAsha(form, initial?.id, initial?.registered), mode);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {mode === "edit" ? "✏️ Edit ASHA Worker" : "➕ Add New ASHA Worker"}
          </div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">⚠️ {error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name<span className="required">*</span></label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Sunita Devi"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number<span className="required">*</span></label>
                <input
                  className="form-input"
                  type="tel"
                  value={form.mobile}
                  onChange={(e) => set("mobile", e.target.value)}
                  placeholder="10-digit number"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email (used to login)<span className="required">*</span></label>
                <input
                  className="form-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="worker@ashacare.in"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password<span className="required">*</span></label>
                <div style={{ position: "relative" }}>
                  <input
                    className="form-input has-action"
                    type={showPass ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Set a login password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    style={{
                      position: "absolute", right: 12, top: "50%",
                      transform: "translateY(-50%)", background: "none",
                      border: "none", cursor: "pointer", fontSize: 15,
                      color: "rgba(109,40,217,0.5)",
                    }}
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <div className="form-group full">
                <label className="form-label">Assigned Location (Village / City)<span className="required">*</span></label>
                <input
                  className="form-input"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. Noida"
                />
                <span className="textarea-hint">
                  This ASHA worker will only see and manage patients registered under this location.
                </span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-purple" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? "Saving…" : mode === "edit" ? "Update ASHA Worker" : "Add ASHA Worker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Manage ASHA Dashboard (Admin only) ──────────────────────────────────────
// Admin adds ASHA workers tied to a location (e.g. Noida, Ghaziabad). Each
// worker then logs in with role "asha" and gets the same dashboard/capabilities
// as Admin, except this page — only the one Admin account can manage ASHA.
function ManageAsha({ ashaWorkers, setAshaWorkers, patients, toast, onBack }) {
  const [formModal, setFormModal]     = useState(null); // { mode: 'add' | 'edit', worker } | null
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [q, setQ] = useState("");

  const openAddForm  = () => setFormModal({ mode: "add", worker: null });
  const openEditForm = (worker) => setFormModal({ mode: "edit", worker });
  const closeForm    = () => setFormModal(null);

  const handleFormSubmit = async (worker, mode) => {
    if (mode === "edit") {
      // NOTE: there is no backend endpoint yet to update an existing ASHA
      // worker's profile (name/mobile/location) — only account *creation*
      // (createUser) and *role* changes (updateUserRole) exist server-side.
      // This still only updates local state, so edits will NOT persist
      // after a refresh/re-login until that endpoint is added.
      setAshaWorkers((prev) => prev.map((w) => (w.id === worker.id ? { ...w, ...worker } : w)));
      toast?.(
        "Updated locally only",
        "error",
        "Editing isn't wired to the backend yet — this change will be lost on refresh."
      );
    } else {
      // This is the real fix: actually create the Firebase Auth user +
      // Firestore `users` doc via the backend, instead of only touching
      // local React state. The onSnapshot listener on `users` (role=="asha")
      // in App will pick up the new doc automatically, so we don't need to
      // (and shouldn't) manually push `worker` into ashaWorkers here.
      await createUser({
        email:    worker.email,
        password: worker.password,
        name:     worker.name,
        role:     "asha",
        mobile:   worker.mobile,
        location: worker.location,
      });
      toast?.("ASHA worker added successfully!", "success", `${worker.name} • ${worker.location}`);
    }
    setFormModal(null);
  };

  const requestDelete = (worker) => setDeleteTarget(worker);
  const cancelDelete  = () => setDeleteTarget(null);
  const confirmDeleteWorker = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      // Actually revoke the Firebase Auth account + Firestore doc.
      // Falls back to local-only removal if this worker predates the fix
      // and has no `uid` (e.g. leftover mock/local entries).
      if (target.uid) {
        await deleteAuthUser(target.uid);
      }
      setAshaWorkers((prev) => prev.filter((w) => w.id !== target.id));
      toast?.("ASHA worker removed", "success", `${target.name} (${target.location})`);
    } catch (err) {
      toast?.("Failed to remove ASHA worker", "error", err.message || "Please try again.");
    }
  };

  const patientsFor = (location) =>
    patients.filter(
      (p) => (p.village || "").trim().toLowerCase() === (location || "").trim().toLowerCase()
    ).length;

  const query = q.trim().toLowerCase();
  const filtered = query
    ? ashaWorkers.filter(
        (w) => w.name.toLowerCase().includes(query) || w.location.toLowerCase().includes(query)
      )
    : ashaWorkers;

  const locationsCovered = new Set(ashaWorkers.map((w) => w.location.trim().toLowerCase())).size;

  return (
    <div className="page-body">
      {/* Back / Add actions */}
      <div className="flex items-center gap-3 mb-4" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-outline-purple btn-sm" onClick={onBack}>← Back to Dashboard</button>
        <button className="btn btn-gold btn-sm" onClick={openAddForm}>➕ Add ASHA Worker</button>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">⚕️</div>
          <div className="stat-label">Total ASHA Workers</div>
          <div className="stat-value">{ashaWorkers.length}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon">📍</div>
          <div className="stat-label">Locations Covered</div>
          <div className="stat-value">{locationsCovered}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">👥</div>
          <div className="stat-label">Total Patients</div>
          <div className="stat-value">{patients.length}</div>
        </div>
      </div>

      {/* ASHA Workers Card */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-hi">आशा कार्यकर्ता प्रबंधन</span>
          </div>
        </div>
        <div className="card-body">
          <div className="search-bar">
            <div className="search-input-wrapper">
              <input
                className="search-input"
                type="text"
                autoComplete="off"
                placeholder="🔍  Search ASHA workers by name or location…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ASHA Worker</th>
                  <th>ID</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Patients in Area</th>
                  <th>Added On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      {ashaWorkers.length === 0
                        ? 'No ASHA workers added yet — click "Add ASHA Worker" to create one.'
                        : "No ASHA workers found"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <div className="patient-cell">
                          <div className="patient-avatar">{w.name[0]}</div>
                          <div>
                            <div className="patient-name">{w.name}</div>
                            <div className="patient-id">{w.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="badge badge-purple">{w.id}</span></td>
                      <td><span className="badge badge-blue">📍 {w.location}</span></td>
                      <td className="text-sm">{w.mobile}</td>
                      <td><span className="badge badge-green">{patientsFor(w.location)} patients</span></td>
                      <td className="text-xs text-muted">{w.registered}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline-purple btn-sm" onClick={() => openEditForm(w)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => requestDelete(w)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit ASHA worker modal */}
      {formModal && (
        <AshaFormModal
          mode={formModal.mode}
          initial={formModal.worker}
          existingWorkers={ashaWorkers}
          onCancel={closeForm}
          onSubmit={handleFormSubmit}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🗑️ Remove ASHA Worker</div>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">
              Are you sure you want to remove <strong>{deleteTarget.name}</strong> ({deleteTarget.location})?
              They will no longer be able to log in, and this location will need a new ASHA worker assigned.
              This action cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-purple" onClick={cancelDelete}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteWorker}>Remove Worker</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Title Map ───────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: "Dashboard",
  patients:  "All Patients",
  register:  "Register Patient",
  chatbot:   "AI Assistant",
  medical:   "Medical Analysis",
  profile:   "My Profile",
  records:   "Health Records",
  schemes:   "Govt Scheme Suggestions",
  "patient-profile": "Patient Profile",
  "edit-patient":    "Edit Patient",
  "manage-asha":     "Manage ASHA Workers",
  "manage-admin":    "Manage Admin Profile",
};

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,          setUser]          = useState(null);
  const [page,          setPage]          = useState("dashboard");
  const [patients,      setPatients]      = useState([]);
  const [ashaWorkers,   setAshaWorkers]   = useState([]);
  const [schemes,       setSchemes]       = useState(GOVT_SCHEMES); // real scheme data — shown until Firestore has its own docs
  const [history,       setHistory]       = useState({});
  const [mobileMenu,    setMobile]        = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [activePatient, setActivePatient] = useState(null);
  const [returnPage,    setReturnPage]    = useState("dashboard");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [authLoading,   setAuthLoading]   = useState(true); // prevents flash of login page
  const { toasts, add: toast, dismiss }  = useToast();

  // Tracks when a manual login is in progress so onAuthStateChanged doesn't
  // race ahead and set the user before the role check in handleSubmit runs.
  const isManualLoginRef = useRef(false);

  // ── Restore session on page refresh ────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // A manual login (handleSubmit) is in progress — it will call onLogin
        // itself after the role check. Don't touch user state here.
        if (isManualLoginRef.current) {
          setAuthLoading(false);
          return;
        }
        try {
          await firebaseUser.getIdToken(true); // refresh so role claim is present
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            const profile = snap.data();
            setUser(profile);
            setPage(profile.role === "patient" ? "profile" : "dashboard");
          }
        } catch (err) {
          console.error("Session restore failed:", err);
        }
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Real-time patients from Firestore ───────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "patients"), orderBy("registered", "desc"));
    return onSnapshot(q, (snap) =>
      setPatients(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [user]);

  // ── Real-time government schemes from Firestore ─────────────────────────────
  // Falls back to the built-in GOVT_SCHEMES until the "govt_schemes" collection
  // actually has documents in it — see seedGovtSchemes.js to push them in.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "govt_schemes"), (snap) => {
      if (!snap.empty) {
        setSchemes(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    });
  }, [user]);

  // ── Real-time ASHA workers list (admin/super_admin only) ────────────────────
  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin" && user.role !== "super_admin") return;
    const q = query(collection(db, "users"), where("role", "==", "asha"));
    return onSnapshot(q, (snap) =>
      setAshaWorkers(snap.docs.map((d) => d.data()))
    );
  }, [user]);

  // ── Load visit history when a patient is opened ─────────────────────────────
  useEffect(() => {
    if (!activePatient) return;
    const q = query(
      collection(db, "patients", activePatient.id, "visits"),
      orderBy("date", "desc")
    );
    return onSnapshot(q, (snap) => {
      const visits = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setHistory((prev) => ({ ...prev, [activePatient.id]: visits }));
    });
  }, [activePatient]);

  // ── Auth helpers ────────────────────────────────────────────────────────────
  const login = (profile) => {
    isManualLoginRef.current = false;
    setUser(profile);
    setPage(profile.role === "patient" ? "profile" : "dashboard");
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setPatients([]);
    setSchemes([]);
    setAshaWorkers([]);
    setHistory({});
    setPage("dashboard");
    setCollapsed(false);
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const handleNav    = (key) => { setPage(key); setMobile(false); };
  const openProfile  = (p)   => { setActivePatient(p); setReturnPage(page); setPage("patient-profile"); };
  const openEdit     = (p)   => { setActivePatient(p); setReturnPage(page); setPage("edit-patient"); };

  // ── Patient CRUD (wired to Vercel backend via api.js) ───────────────────────
  const addNewPatient = async (p) => {
    try {
      const { _createLogin, _password, ...patientData } = p;
      let result;
      if (_createLogin && _password) {
        // Staff is creating patient + login account in one step
        result = await adminCreatePatient({ ...patientData, password: _password });
      } else {
        result = await addPatient(patientData);
      }
      toast("Patient registered!", "success", `ID: ${result.patientId}`);
      setPage("patients");
    } catch (err) {
      toast(err.message, "error", "Registration failed");
    }
  };

  const saveEditedPatient = async (updated) => {
    try {
      // Strip read-only fields before sending to backend
      const { id, createdAt, createdBy, registered, ...updates } = updated;
      await updatePatient(id, updates);
      setActivePatient(updated);
      toast("Patient updated successfully!", "success", `${updated.name} (${updated.id})`);
      setPage(returnPage === "edit-patient" ? "dashboard" : returnPage);
    } catch (err) {
      toast(err.message, "error", "Update failed");
    }
  };

  const requestDelete         = (p) => setConfirmDelete(p);
  const cancelDelete          = ()  => setConfirmDelete(null);
  const confirmDeletePatient  = async () => {
    try {
      await deletePatient(confirmDelete.id);
      toast("Patient deleted", "success", `${confirmDelete.name} removed`);
      if (page === "patient-profile" && activePatient?.id === confirmDelete.id) {
        setPage(returnPage === "patient-profile" ? "dashboard" : returnPage);
      }
      setConfirmDelete(null);
    } catch (err) {
      toast(err.message, "error", "Delete failed");
    }
  };

  // ── Loading state (prevents flash of login screen on refresh) ───────────────
  if (authLoading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--bg, #0f0f1a)", color: "#a78bfa",
        fontSize: "1.1rem", fontFamily: "sans-serif",
      }}>
        Loading Asha Care…
      </div>
    );
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!user) return (
    <>
      <AuthPage
        onLogin={login}
        onLoginStart={() => { isManualLoginRef.current = true; }}
        onLoginEnd={()  => { isManualLoginRef.current = false; }}
      />
      <Toast toasts={toasts} dismiss={dismiss} />
    </>
  );

  // ── ASHA workers only see patients in their assigned village ────────────────
  const visiblePatients = user.role === "asha"
    ? patients.filter(
        (p) => (p.village || "").trim().toLowerCase() === (user.location || "").trim().toLowerCase()
      )
    : patients;

  // ── Page router ─────────────────────────────────────────────────────────────
  const renderPage = () => {
    const isStaff = user.role === "admin" || user.role === "super_admin" || user.role === "asha";

    if (isStaff) {
      if (page === "dashboard") return (
        <AdminDashboard
          patients={visiblePatients}
          user={user}
          onNav={handleNav}
          onEditPatient={openEdit}
          onViewPatient={openProfile}
          onDeletePatient={requestDelete}
        />
      );
      if (page === "manage-admin" && user.role !== "asha") return (
        <ManageAdminProfile
          adminProfile={user}
          // NOTE: `user` (the Firestore login profile) has no `password` field —
          // Firebase Auth never exposes it client-side. The password-change and
          // security-question panels below still compare against
          // `adminProfile.password`, so they will always report "incorrect
          // password" until that logic is rewired to Firebase's
          // reauthenticateWithCredential()/updatePassword() flow. This setter
          // only keeps `name` edits working (and prevents a crash) for now.
          setAdminProfile={(updater) =>
            setUser((u) => (typeof updater === "function" ? updater(u) : updater))
          }
          toast={toast}
          onBack={() => setPage("dashboard")}
          onLogout={logout}
          onNameSaved={(n) => setUser((u) => ({ ...u, name: n }))}
        />
      );
      if (page === "manage-asha" && user.role !== "asha") return (
        <ManageAsha
          ashaWorkers={ashaWorkers}
          setAshaWorkers={setAshaWorkers}
          patients={patients}
          toast={toast}
          onBack={() => setPage("dashboard")}
        />
      );
      if (page === "patients") return (
        <div className="page-body">
          <div className="card card-ai">
            <div className="card-header"><div className="card-title">👥 All Patients</div></div>
            <div className="card-body">
              <PatientsTable
                patients={visiblePatients}
                onEdit={openEdit}
                onView={openProfile}
                onDelete={requestDelete}
              />
            </div>
          </div>
        </div>
      );
      if (page === "register") return (
        <RegisterPatient
          key="new"
          onNav={handleNav}
          toast={toast}
          user={user}
          onSave={addNewPatient}
          defaultVillage={user.role === "asha" ? user.location : ""}
        />
      );
      if (page === "edit-patient") return (
        <RegisterPatient
          key={activePatient?.id || "edit"}
          onNav={handleNav}
          toast={toast}
          editPatient={activePatient}
          onSave={saveEditedPatient}
          onCancel={() => setPage(returnPage)}
        />
      );
      if (page === "patient-profile") return (
        <PatientProfileView
          patient={visiblePatients.find((p) => p.id === activePatient?.id) || activePatient}
          history={history}
          setHistory={setHistory}
          isAdmin
          toast={toast}
          onBack={() => setPage(returnPage)}
          onEdit={openEdit}
        />
      );
      if (page === "chatbot")  return <ChatBot />;
      if (page === "medical")  return <MedicalAnalysis />;
      if (page === "schemes")  return (
        <GovtSchemes schemes={schemes} setSchemes={setSchemes} isAdmin toast={toast} />
      );
    } else {
      // Patient role
      if (page === "profile")  return <PatientDashboard user={user} />;
      if (page === "records")  return <HealthRecords user={user} history={history} setHistory={setHistory} />;
      if (page === "chatbot")  return <ChatBot />;
      if (page === "medical")  return <MedicalAnalysis />;
      if (page === "schemes")  return <GovtSchemes schemes={schemes} setSchemes={setSchemes} isAdmin={false} toast={toast} />;
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <div className="app-layout">
        <Sidebar
          user={user}
          active={page}
          onNav={handleNav}
          mobileOpen={mobileMenu}
          onOverlayClick={() => setMobile(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((p) => !p)}
          patientCount={visiblePatients.length}
        />
        <div className={`main-content${collapsed ? " sidebar-collapsed-content" : ""}`}>
          <TopBar
            user={user}
            pageTitle={PAGE_TITLES[page] || "Asha Care"}
            onLogout={logout}
            onMenuToggle={() => setMobile((p) => !p)}
            onNav={handleNav}
          />
          {renderPage()}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🗑️ Delete Patient</div>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong> (ID: {confirmDelete.id})?
              This will permanently remove their record and visit history. This action cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-purple" onClick={cancelDelete}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeletePatient}>Delete Patient</button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} dismiss={dismiss} />
    </AuthContext.Provider>
  );
}