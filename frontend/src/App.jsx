import { useState, useEffect, createContext, useContext } from "react";
import "./App.css";

// ─── Auth Context ────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ─── Mock Data ───────────────────────────────────────────────────────────────
const MOCK_PATIENTS = [
  {
    id: "P001", name: "Priya Sharma", age: 28, gender: "Female",
    blood: "B+", mobile: "9876543210", email: "priya@email.com",
    village: "Noida", state: "Uttar Pradesh", diseases: "Diabetes",
    registered: "2024-11-10",
  },
  {
    id: "P002", name: "Rahul Verma", age: 35, gender: "Male",
    blood: "O+", mobile: "9123456780", email: "rahul@email.com",
    village: "Ghaziabad", state: "Uttar Pradesh", diseases: "Hypertension",
    registered: "2024-12-01",
  },
  {
    id: "P003", name: "Sunita Devi", age: 42, gender: "Female",
    blood: "A+", mobile: "9988776655", email: "sunita@email.com",
    village: "Meerut", state: "Uttar Pradesh", diseases: "Asthma",
    registered: "2025-01-15",
  },
  {
    id: "P004", name: "Amit Kumar", age: 31, gender: "Male",
    blood: "AB+", mobile: "8877665544", email: "amit@email.com",
    village: "Lucknow", state: "Uttar Pradesh", diseases: "None",
    registered: "2025-02-20",
  },
];

const ADMIN_CREDS  = { email: "admin@ashacare.in", password: "admin123" };
const PATIENT_CREDS = { email: "priya@email.com",   password: "patient123" };

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
function AuthPage({ onLogin }) {
  const [role, setRole]       = useState("admin");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showPass, setShowP]  = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const creds = role === "admin" ? ADMIN_CREDS : PATIENT_CREDS;
      if (email === creds.email && password === creds.password) {
        onLogin({ role, email, name: role === "admin" ? "ASHA Worker" : "Priya Sharma" });
      } else {
        setError("Invalid email or password. Please try again.");
      }
      setLoading(false);
    }, 900);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-title">
            Asha<span>+</span> Care
          </div>
          <div className="auth-logo-sub">AI-Powered Healthcare Platform</div>
        </div>

        {/* Role Toggle */}
        <div className="auth-role-toggle">
          <button
            className={`auth-role-btn ${role === "admin" ? "active" : ""}`}
            onClick={() => { setRole("admin"); setError(""); }}
          >
            🏥 ASHA Worker
          </button>
          <button
            className={`auth-role-btn ${role === "patient" ? "active" : ""}`}
            onClick={() => { setRole("patient"); setError(""); }}
          >
            🧑‍⚕️ Patient
          </button>
        </div>

        <div className="auth-heading">Welcome Back</div>
        <div className="auth-sub">
          {role === "admin"
            ? "Sign in to manage patients and health records"
            : "Sign in to view your health profile"}
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group mb-4">
            <label className="form-label">Email Address</label>
            <div className="input-wrapper">
              <span className="input-icon">📧</span>
              <input
                className="form-input has-icon"
                type="email"
                placeholder={role === "admin" ? "admin@ashacare.in" : "patient@email.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="form-label">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                className="form-input has-icon has-action"
                type={showPass ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPass(e.target.value)}
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowP((p) => !p)}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="form-error mb-4"
              style={{
                background: "#FEE2E2", padding: "10px 14px",
                borderRadius: 8, border: "1px solid #FCA5A5"
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-purple w-full btn-lg"
            disabled={loading}
            style={{ justifyContent: "center" }}
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="auth-divider">Demo Credentials</div>
        <div style={{ background: "var(--purple-bg)", borderRadius: 10, padding: "12px 16px", fontSize: 12 }}>
          <div style={{ marginBottom: 4 }}>
            <b>Admin:</b> admin@ashacare.in / admin123
          </div>
          <div>
            <b>Patient:</b> priya@email.com / patient123
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const ADMIN_NAV = [
  { key: "dashboard", icon: "📊", label: "Dashboard" },
  { key: "patients",  icon: "👥", label: "All Patients",  badge: "24" },
  { key: "register",  icon: "➕", label: "Register Patient" },
  { key: "chatbot",   icon: "🤖", label: "AI Assistant" },
];

const PATIENT_NAV = [
  { key: "profile",  icon: "🧑‍⚕️", label: "My Profile" },
  { key: "records",  icon: "📋", label: "Health Records" },
  { key: "chatbot",  icon: "🤖", label: "AI Health Guide" },
];

function Sidebar({ user, active, onNav, mobileOpen, onOverlayClick }) {
  const nav = user.role === "admin" ? ADMIN_NAV : PATIENT_NAV;
  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? "active" : ""}`} onClick={onOverlayClick} />
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-card" onClick={() => onNav(nav[0].key)}>
            <div className="brand-title">Asha<span>+</span></div>
            <div className="brand-sub">Healthcare Platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Menu</div>
          {nav.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${active === item.key ? "active" : ""}`}
              onClick={() => onNav(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.badge && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div
            className="nav-item"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "var(--radius-md)",
              marginBottom: 0,
            }}
          >
            <div
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "var(--gold-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, color: "var(--text-dark)",
                flexShrink: 0,
              }}
            >
              {user.name[0]}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontSize: 13, fontWeight: 700,
                  color: "#fff", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis"
                }}
              >
                {user.name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                {user.role === "admin" ? "ASHA Worker" : "Patient"}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
function TopBar({ user, pageTitle, onLogout, onMenuToggle }) {
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
        <div className="welcome-text">
          {user.email}
        </div>
        <button className="btn-signout" onClick={onLogout}>Sign Out</button>
      </div>
    </header>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ patients, onNav }) {
  const male   = patients.filter((p) => p.gender === "Male").length;
  const female = patients.filter((p) => p.gender === "Female").length;

  const stats = [
    { label: "Total Patients",     value: patients.length, icon: "👥", cls: "purple", change: "+12%" },
    { label: "New Registrations",  value: 8,               icon: "✅", cls: "green",  change: "+5 this month" },
    { label: "Male Patients",      value: male,            icon: "👨", cls: "blue",   change: `${((male/patients.length)*100).toFixed(0)}%` },
    { label: "Female Patients",    value: female,          icon: "👩", cls: "pink",   change: `${((female/patients.length)*100).toFixed(0)}%` },
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
          <button className="btn-tab">Patient History</button>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => onNav("register")}>
          ➕ Add Patient
        </button>
      </div>

      {/* AI-Powered Card */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-hi">मरीज की जानकारी (AI Powered)</span>
            <span className="ai-badge">✨ AI</span>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => onNav("chatbot")}>
            Open AI Assistant
          </button>
        </div>
        <div className="card-body">
          <PatientsTable patients={patients} />
        </div>
      </div>
    </div>
  );
}

// ─── Patients Table ───────────────────────────────────────────────────────────
function PatientsTable({ patients }) {
  const [q, setQ] = useState("");
  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.id.toLowerCase().includes(q.toLowerCase()) ||
      p.village.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="search-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search patients by name, ID or village…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
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
                        <div className="patient-name">{p.name}</div>
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
                  <td className="text-xs text-muted">{p.registered}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-purple btn-sm">View</button>
                      <button className="btn btn-outline-purple btn-sm">Edit</button>
                      <button className="btn btn-danger btn-sm">Del</button>
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

// ─── Patient Registration Form ────────────────────────────────────────────────
function RegisterPatient({ onNav, toast }) {
  const [listening, setListening] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm]           = useState({
    fullName: "", age: "", dob: "", gender: "", mobile: "", email: "",
    weight: "", height: "", blood: "", address: "", village: "",
    state: "Uttar Pradesh", pin: "", diseases: "", allergies: "",
    medications: "", emergencyName: "", emergencyNumber: "",
  });

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
    rec.lang = "hi-IN";
    rec.onresult = (e) => {
      set(field, e.results[0][0].transcript);
      setListening(null);
    };
    rec.onerror = () => setListening(null);
    rec.start();
  };

  const handleOCR = () => {
    setUploading(true);
    setTimeout(() => {
      setForm((f) => ({
        ...f,
        fullName: "Kavita Singh",
        age: "34",
        mobile: "9811223344",
        village: "Varanasi",
        state: "Uttar Pradesh",
        pin: "221001",
      }));
      setUploading(false);
      toast("Document scanned! Fields auto-filled ✨", "success");
    }, 1800);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    toast("Patient registered successfully!", "success", `ID: P00${Math.floor(Math.random()*900+100)}`);
    setTimeout(() => onNav("patients"), 1200);
  };

  const VoiceField = ({ field, label, type = "text", placeholder, required }) => (
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
          title="Voice input"
          style={{ position: "absolute", right: 8 }}
        >
          🎙️
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-body">
      {/* OCR Zone */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">📄 Smart Document Scanner (OCR)</div>
          <span className="ai-badge">✨ AI Powered</span>
        </div>
        <div className="card-body">
          <div
            className={`upload-zone ${uploading ? "dragover" : ""}`}
            onClick={handleOCR}
          >
            {uploading ? (
              <>
                <div className="upload-icon">⏳</div>
                <div className="upload-title">Scanning document…</div>
                <div className="upload-sub">Extracting patient information with AI</div>
              </>
            ) : (
              <>
                <div className="upload-icon">📷</div>
                <div className="upload-title">Upload Aadhaar / Health Card</div>
                <div className="upload-sub">
                  Click to scan and auto-fill patient details using OCR
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card card-ai">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-hi">मरीज पंजीकरण</span>
            <span className="ai-badge">🎙️ Voice Input</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>

            {/* Personal */}
            <div className="form-section">
              <div className="form-section-title">👤 Personal Information</div>
              <div className="form-grid">
                <VoiceField field="fullName" label="Full Name" placeholder="Enter full name" required />
                <VoiceField field="age"    label="Age"    type="number" placeholder="e.g. 28" required />
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dob}
                    onChange={(e) => set("dob", e.target.value)}
                  />
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
                <VoiceField field="mobile" label="Mobile Number" type="tel" placeholder="10-digit number" required />
                <VoiceField field="email"  label="Email"    type="email" placeholder="patient@email.com" />
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
                <VoiceField field="village" label="Village / City" placeholder="e.g. Ghaziabad" required />
                <div className="form-group">
                  <label className="form-label">State</label>
                  <select className="form-select" value={form.state}
                    onChange={(e) => set("state", e.target.value)}>
                    {["Uttar Pradesh","Delhi","Bihar","Rajasthan","Maharashtra","Other"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <VoiceField field="pin" label="PIN Code" type="number" placeholder="6-digit PIN" />
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
                <VoiceField field="diseases"    label="Existing Diseases"   placeholder="e.g. Diabetes, TB" />
                <VoiceField field="allergies"   label="Allergies"           placeholder="e.g. Penicillin" />
                <VoiceField field="medications" label="Current Medications" placeholder="e.g. Metformin 500mg" />
                <VoiceField field="emergencyName"   label="Emergency Contact Name"   placeholder="Relative name" />
                <VoiceField field="emergencyNumber" label="Emergency Contact Number" type="tel" placeholder="10-digit" />
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn btn-outline-purple"
                onClick={() => onNav("patients")}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold btn-lg">
                ✅ Register Patient
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
  const patient = MOCK_PATIENTS[0];

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

// ─── AI Chatbot ───────────────────────────────────────────────────────────────
const BOT_GREET =
  "नमस्ते! 🙏 I'm Asha AI, your health assistant. Ask me about symptoms, medicines, or general health tips!";

function ChatBot() {
  const [messages, setMessages] = useState([
    { from: "bot", text: BOT_GREET },
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoad]  = useState(false);

  const sendMsg = async () => {
    if (!input.trim()) return;
    const userMsg = { from: "user", text: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoad(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system:
            "You are Asha AI, a friendly and knowledgeable healthcare assistant for ASHA workers in rural India. Respond in simple English or Hindi mixed (Hinglish). Keep answers concise, warm, and medically responsible. Always advise to consult a doctor for serious issues.",
          messages: [{ role: "user", content: input }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map((c) => c.text || "").join("") || "Sorry, I couldn't process that.";
      setMessages((m) => [...m, { from: "bot", text }]);
    } catch {
      setMessages((m) => [
        ...m,
        { from: "bot", text: "⚠️ Unable to connect to AI. Please try again." },
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
            <span className="ai-badge">✨ Powered by Claude</span>
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
                  {m.text}
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
                placeholder="Ask a health question in English or Hindi…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              />
              <button className="btn btn-gold btn-sm" onClick={sendMsg} disabled={loading}>
                Send ➤
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested prompts */}
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
    </div>
  );
}

// ─── Health Records ───────────────────────────────────────────────────────────
function HealthRecords() {
  return (
    <div className="page-body">
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">📋 Health Records</div>
          <span className="badge badge-gold">3 Records</span>
        </div>
        <div className="card-body">
          {[
            { date: "Jan 15, 2025", doctor: "Dr. Amit Jain", type: "General Checkup", note: "BP normal, advised exercise" },
            { date: "Nov 10, 2024", doctor: "Dr. Sunita Rao", type: "Diabetes Screening", note: "HbA1c 6.2 – pre-diabetic range" },
            { date: "Aug 05, 2024", doctor: "Dr. Ravi Kumar", type: "Eye Checkup", note: "No issues found" },
          ].map((r, i) => (
            <div
              key={i}
              style={{
                padding: "16px 0",
                borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 44, height: 44, borderRadius: "var(--radius-md)",
                  background: "var(--purple-soft)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0,
                }}
              >🩺</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--text-dark)" }}>{r.type}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0" }}>
                  {r.doctor} · {r.date}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dark)" }}>{r.note}</div>
              </div>
              <button className="btn btn-outline-purple btn-sm">View</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page Title Map ───────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: "Dashboard",
  patients:  "All Patients",
  register:  "Register Patient",
  chatbot:   "AI Assistant",
  profile:   "My Profile",
  records:   "Health Records",
};

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,        setUser]   = useState(null);
  const [page,        setPage]   = useState("dashboard");
  const [patients,    setPatients] = useState(MOCK_PATIENTS);
  const [mobileMenu,  setMobile]  = useState(false);
  const { toasts, add: toast, dismiss } = useToast();

  const login  = (u) => { setUser(u); setPage(u.role === "admin" ? "dashboard" : "profile"); };
  const logout = () => { setUser(null); setPage("dashboard"); };

  const handleNav = (key) => { setPage(key); setMobile(false); };

  if (!user) return (
    <>
      <AuthPage onLogin={login} />
      <Toast toasts={toasts} dismiss={dismiss} />
    </>
  );

  const renderPage = () => {
    if (user.role === "admin") {
      if (page === "dashboard") return <AdminDashboard patients={patients} onNav={handleNav} />;
      if (page === "patients")  return <div className="page-body"><div className="card card-ai"><div className="card-header"><div className="card-title">👥 All Patients</div></div><div className="card-body"><PatientsTable patients={patients} /></div></div></div>;
      if (page === "register")  return <RegisterPatient onNav={handleNav} toast={toast} />;
      if (page === "chatbot")   return <ChatBot />;
    } else {
      if (page === "profile")  return <PatientDashboard user={user} />;
      if (page === "records")  return <HealthRecords />;
      if (page === "chatbot")  return <ChatBot />;
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
        />
        <div className="main-content">
          <TopBar
            user={user}
            pageTitle={PAGE_TITLES[page] || "Asha Care"}
            onLogout={logout}
            onMenuToggle={() => setMobile((p) => !p)}
          />
          {renderPage()}
        </div>
      </div>
      <Toast toasts={toasts} dismiss={dismiss} />
    </AuthContext.Provider>
  );
}
