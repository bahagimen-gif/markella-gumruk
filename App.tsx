import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** =========================
 * TYPES
 * ========================= */
type Passenger = {
  id: number;
  name: string;
  passport: string;
  phone: string;
  checked: boolean;
  visaFlag: boolean;
  dupOf?: string;
  dupIndex?: number;
};

type TourPayload = {
  meta: TourMeta;
  passengers: Passenger[];
  ts: number;
};

type TourMeta = {
  code: string;      // TUR-XXXX
  agency: string;    // Acenta adı
  group: string;     // Grup adı / saat
  dateKey: string;   // YYYY-MM-DD
  ts: number;        // yerel son güncelleme
};

/** =========================
 * FIREBASE (REST)
 * ========================= */
const FB = {
  databaseURL: "https://markella-rezervasyon-default-rtdb.europe-west1.firebasedatabase.app",
};
const dbURL = (path: string) => `${FB.databaseURL}/${path}.json`;

function fetchWithTimeout(url: string, options: any = {}, timeout = 5000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout)),
  ]);
}

async function fbGet(path: string) {
  try {
    if (!navigator.onLine) return null;
    const r = (await fetchWithTimeout(dbURL(path), {}, 5000)) as Response;
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function fbSet(path: string, data: any) {
  try {
    if (!navigator.onLine) return false;
    const r = (await fetchWithTimeout(
      dbURL(path),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
      5000
    )) as Response;
    return r.ok;
  } catch {
    return false;
  }
}

function fbListen(path: string, cb: (d: any) => void) {
  let on = true;
  let last = "";
  const poll = async () => {
    if (!on) return;
    if (!navigator.onLine) {
      setTimeout(poll, 2500);
      return;
    }
    const d = await fbGet(path);
    const s = JSON.stringify(d);
    if (s !== last) {
      last = s;
      cb(d);
    }
    if (on) setTimeout(poll, 2500);
  };
  poll();
  return () => {
    on = false;
  };
}

/** =========================
 * HELPERS
 * ========================= */
function genCode() {
  const c = "ABCDEFGHJKLMNPRSTUVYZ23456789";
  let r = "TUR-";
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function todayKey() {
  // TR timezone farkı için basit: browser local time yeterli
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Duplicate + sorting (seninkiyle aynı mantık) */
function surnameOf(fullName: string) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
}
function sortBySurnameThenName<T extends { name: string }>(list: T[]) {
  return [...list].sort((a, b) => {
    const sa = surnameOf(a.name);
    const sb = surnameOf(b.name);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase(), "tr");
  });
}
function uniquifyByNameWithCounter<T extends { name: string }>(list: T[]) {
  const counts = new Map<string, number>();
  return list.map((p) => {
    const base = (p.name || "").trim();
    const key = base.toLowerCase();
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    if (n === 1) return p;
    return { ...(p as any), name: `${base} (${n})`, dupOf: base, dupIndex: n };
  });
}
function normalizePassengerList(list: Passenger[]) {
  const sorted = sortBySurnameThenName(list);
  return uniquifyByNameWithCounter(sorted) as Passenger[];
}

/** =========================
 * LOCAL STORAGE KEYS (Multi-tour)
 * ========================= */
const LS = {
  toursIndex: "mk_toursIndex_v1",     // TourMeta[]
  activeCode: "mk_activeTour_v1",     // string
  tourDataPrefix: "mk_tourData_v1_",  // mk_tourData_v1_TUR-XXXX => TourPayload
};

function tourKey(code: string) {
  return LS.tourDataPrefix + code;
}

/** =========================
 * UI - very simple (you can swap back your styled UI)
 * ========================= */
function Input({ label, value, onChange }: any) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          outline: "none",
        }}
      />
    </label>
  );
}

/** =========================
 * MAIN APP
 * ========================= */
export default function App() {
  const [online, setOnline] = useState(true);

  // Multi-tour state
  const [tours, setTours] = useState<TourMeta[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  // Current tour data (same as your old state)
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [search, setSearch] = useState("");

  // Create/join sheet state
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const [agency, setAgency] = useState("");
  const [group, setGroup] = useState("");
  const [dateKey, setDateKey] = useState(todayKey());

  const [joinCode, setJoinCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [createErr, setCreateErr] = useState("");

  // Sync refs
  const stopRef = useRef<null | (() => void)>(null);
  const localTsRef = useRef<number>(0);
  const lastPushRef = useRef<string>("");

  /** Online/offline listeners */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /** Load index + last active */
  useEffect(() => {
    const idx = safeJsonParse<TourMeta[]>(localStorage.getItem(LS.toursIndex), []);
    setTours(idx);

    const last = localStorage.getItem(LS.activeCode);
    if (last) {
      const payload = safeJsonParse<TourPayload | null>(localStorage.getItem(tourKey(last)), null);
      if (payload?.meta?.code) {
        setActiveCode(payload.meta.code);
        setPassengers(payload.passengers || []);
        localTsRef.current = payload.ts || payload.meta.ts || 0;
        lastPushRef.current = JSON.stringify(payload.passengers || []);
      }
    }
  }, []);

  /** Persist index */
  useEffect(() => {
    localStorage.setItem(LS.toursIndex, JSON.stringify(tours));
  }, [tours]);

  /** Persist activeCode */
  useEffect(() => {
    if (!activeCode) return;
    localStorage.setItem(LS.activeCode, activeCode);
  }, [activeCode]);

  /** Persist current tour payload locally whenever passengers change */
  useEffect(() => {
    if (!activeCode) return;

    const meta = tours.find((t) => t.code === activeCode);
    if (!meta) return;

    const ts = Date.now();
    localTsRef.current = ts;

    const payload: TourPayload = {
      meta: { ...meta, ts },
      passengers,
      ts,
    };

    localStorage.setItem(tourKey(activeCode), JSON.stringify(payload));

    // also update meta ts in index
    setTours((prev) =>
      prev.map((t) => (t.code === activeCode ? { ...t, ts } : t))
    );
  }, [passengers, activeCode, tours]);

  /** Push to Firebase when passengers change (only if active tour exists) */
  useEffect(() => {
    if (!activeCode) return;

    // prevent useless push loops
    const curr = JSON.stringify(passengers);
    if (curr === lastPushRef.current) return;
    lastPushRef.current = curr;

    const meta = tours.find((t) => t.code === activeCode);
    if (!meta) return;

    const ts = Date.now();
    localTsRef.current = ts;

    const payload: TourPayload = {
      meta: { ...meta, ts },
      passengers,
      ts,
    };

    (async () => {
      try {
        const ok = await fbSet(`tours/${activeCode}`, payload);
        setOnline(ok ? true : navigator.onLine);
      } catch {
        setOnline(false);
      }
    })();
  }, [passengers, activeCode, tours]);

  /** Listen Firebase for active tour (only when online) */
  useEffect(() => {
    if (!activeCode) return;

    // stop previous
    if (stopRef.current) stopRef.current();

    // if offline: do not start listener
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    const stop = fbListen(`tours/${activeCode}`, (remote: TourPayload | null) => {
      if (!navigator.onLine) return;
      if (!remote || !remote.passengers || typeof remote.ts !== "number") return;

      // If remote newer, apply
      if (remote.ts >= (localTsRef.current || 0)) {
        setOnline(true);
        localTsRef.current = remote.ts;
        setPassengers(remote.passengers);
        lastPushRef.current = JSON.stringify(remote.passengers);
      }
    });

    stopRef.current = stop;
    return () => {
      if (stopRef.current) stopRef.current();
    };
  }, [activeCode]);

  /** Offline retry (every 10s) */
  useEffect(() => {
    if (!activeCode) return;
    const t = setInterval(async () => {
      if (online || !navigator.onLine) return;

      const meta = tours.find((x) => x.code === activeCode);
      if (!meta) return;

      const payload: TourPayload = {
        meta: { ...meta, ts: localTsRef.current || Date.now() },
        passengers,
        ts: localTsRef.current || Date.now(),
      };

      const ok = await fbSet(`tours/${activeCode}`, payload);
      if (ok) setOnline(true);
    }, 10000);

    return () => clearInterval(t);
  }, [online, activeCode, tours, passengers]);

  /** Actions (same as your old logic) */
  const toggle = useCallback((id: number) => {
    localTsRef.current = Date.now();
    setPassengers((prev) =>
      normalizePassengerList(prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p)))
    );
  }, []);

  const toggleVisa = useCallback((id: number) => {
    localTsRef.current = Date.now();
    setPassengers((prev) =>
      normalizePassengerList(prev.map((p) => (p.id === id ? { ...p, visaFlag: !p.visaFlag } : p)))
    );
  }, []);

  const addPassenger = useCallback(() => {
    const name = prompt("İsim Soyisim?");
    if (!name || name.trim().length < 2) return;
    const passport = prompt("Pasaport (opsiyonel)") || "";
    const phone = prompt("Telefon (opsiyonel)") || "";
    const now = Date.now() + Math.random();
    const p: Passenger = {
      id: now,
      name: name.trim(),
      passport: passport.trim(),
      phone: phone.trim(),
      checked: false,
      visaFlag: false,
    };
    localTsRef.current = Date.now();
    setPassengers((prev) => normalizePassengerList([...prev, p]));
  }, []);

  /** Filtered list */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return passengers;
    return passengers.filter((p) => p.name.toLowerCase().includes(q));
  }, [passengers, search]);

  /** Counts */
  const total = passengers.length;
  const checkedCount = passengers.filter((p) => p.checked).length;
  const remaining = total - checkedCount;

  /** ====== Tour create ====== */
  const createTour = useCallback(async () => {
    setCreateErr("");
    const a = agency.trim();
    const g = group.trim();
    const d = dateKey.trim();

    if (a.length < 2) return setCreateErr("Acenta adı gerekli");
    if (g.length < 1) return setCreateErr("Grup adı gerekli");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return setCreateErr("Tarih formatı: YYYY-MM-DD");

    const code = genCode();
    const ts = Date.now();

    const meta: TourMeta = { code, agency: a, group: g, dateKey: d, ts };
    const payload: TourPayload = { meta, passengers: [], ts };

    // index add
    setTours((prev) => [meta, ...prev]);

    // local save
    localStorage.setItem(tourKey(code), JSON.stringify(payload));
    localStorage.setItem(LS.activeCode, code);

    // activate
    setActiveCode(code);
    setPassengers([]);
    localTsRef.current = ts;
    lastPushRef.current = "[]";

    setShowCreate(false);

    // try push to firebase (non-blocking)
    fbSet(`tours/${code}`, payload).then((ok) => setOnline(ok ? true : navigator.onLine));
  }, [agency, group, dateKey]);

  /** ====== Tour join ====== */
  const joinTour = useCallback(async () => {
    setJoinErr("");
    const code = joinCode.trim().toUpperCase();
    if (!code.startsWith("TUR-") || code.length !== 8) {
      setJoinErr("Geçersiz tur kodu. Örnek: TUR-A7K9");
      return;
    }

    // Try remote first (if online)
    const remote = await fbGet(`tours/${code}`);

    if (remote && remote.meta && Array.isArray(remote.passengers)) {
      const payload: TourPayload = remote;

      // ensure index contains it
      setTours((prev) => {
        const exists = prev.some((t) => t.code === code);
        if (exists) return prev.map((t) => (t.code === code ? { ...payload.meta } : t));
        return [payload.meta, ...prev];
      });

      // local save
      localStorage.setItem(tourKey(code), JSON.stringify(payload));
      localStorage.setItem(LS.activeCode, code);

      // activate
      setActiveCode(code);
      setPassengers(payload.passengers || []);
      localTsRef.current = payload.ts || payload.meta.ts || Date.now();
      lastPushRef.current = JSON.stringify(payload.passengers || []);

      setShowJoin(false);
      return;
    }

    // If offline or not found remote: try local
    const local = safeJsonParse<TourPayload | null>(localStorage.getItem(tourKey(code)), null);
    if (local && local.meta && Array.isArray(local.passengers)) {
      setActiveCode(code);
      setPassengers(local.passengers || []);
      localTsRef.current = local.ts || local.meta.ts || Date.now();
      lastPushRef.current = JSON.stringify(local.passengers || []);
      setShowJoin(false);
      return;
    }

    setJoinErr("Bu tur kodu bulunamadı (online değilken sadece daha önce girilmiş turlar açılır).");
  }, [joinCode]);

  /** Switch tour */
  const openTour = useCallback((code: string) => {
    const payload = safeJsonParse<TourPayload | null>(localStorage.getItem(tourKey(code)), null);
    if (!payload) {
      // if not local, still switch, it will try remote when online
      setActiveCode(code);
      setPassengers([]);
      localTsRef.current = 0;
      lastPushRef.current = "[]";
      return;
    }
    setActiveCode(code);
    setPassengers(payload.passengers || []);
    localTsRef.current = payload.ts || payload.meta.ts || 0;
    lastPushRef.current = JSON.stringify(payload.passengers || []);
  }, []);

  /** Leave tour (go back to dashboard) */
  const backToDashboard = useCallback(() => {
    setActiveCode(null);
    setPassengers([]);
    setSearch("");
  }, []);

  /** Delete tour locally (optional) */
  const deleteTourLocal = useCallback((code: string) => {
    if (!confirm(`${code} turunu cihazdan silmek istiyor musun? (Firebase silinmez)`)) return;
    localStorage.removeItem(tourKey(code));
    setTours((prev) => prev.filter((t) => t.code !== code));
    if (activeCode === code) backToDashboard();
  }, [activeCode, backToDashboard]);

  /** =========================
   * UI
   * ========================= */
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(145deg, #0f1729 0%, #1a2744 50%, #0f1e3a 100%)",
    color: "#e8edf5",
    fontFamily: "Segoe UI, system-ui, -apple-system, Arial",
    padding: 16,
  };

  // ===== DASHBOARD =====
  if (!activeCode) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Markella Check-In</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                Durum: {online ? "🟢 Canlı" : "🟡 Offline"} — Bugün: {todayKey()}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowCreate(true)}
                style={{ padding: "10px 12px", borderRadius: 10, border: 0, background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                + Yeni Tur
              </button>
              <button
                onClick={() => setShowJoin(true)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Tur Koduna Katıl
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {tours.length === 0 ? (
              <div style={{ padding: 16, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.2)", opacity: 0.75 }}>
                Henüz tur yok. “Yeni Tur” ile başla.
              </div>
            ) : (
              tours
                .slice()
                .sort((a, b) => (b.ts || 0) - (a.ts || 0))
                .map((t) => (
                  <div
                    key={t.code}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>
                        {t.agency} — {t.group}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {t.dateKey} • <b>{t.code}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openTour(t.code)}
                        style={{ padding: "10px 12px", borderRadius: 10, border: 0, background: "#10b981", color: "#062b1f", fontWeight: 900, cursor: "pointer" }}
                      >
                        Aç
                      </button>
                      <button
                        onClick={() => deleteTourLocal(t.code)}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                      >
                        Sil (Cihaz)
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Create modal */}
          {showCreate && (
            <div style={modalOverlay}>
              <div style={modalSheet}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Yeni Tur Oluştur</div>
                <Input label="Acenta" value={agency} onChange={setAgency} />
                <Input label="Grup (örn: Rodos 08:30)" value={group} onChange={setGroup} />
                <Input label="Tarih (YYYY-MM-DD)" value={dateKey} onChange={setDateKey} />
                {createErr && <div style={{ color: "#fb7185", fontSize: 12, marginTop: 6 }}>{createErr}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={createTour} style={btnBlue}>
                    Oluştur
                  </button>
                  <button onClick={() => setShowCreate(false)} style={btnGray}>
                    İptal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Join modal */}
          {showJoin && (
            <div style={modalOverlay}>
              <div style={modalSheet}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Tur Koduna Katıl</div>
                <Input label="Tur Kodu" value={joinCode} onChange={setJoinCode} />
                {joinErr && <div style={{ color: "#fb7185", fontSize: 12, marginTop: 6 }}>{joinErr}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={joinTour} style={btnBlue}>
                    Katıl
                  </button>
                  <button onClick={() => setShowJoin(false)} style={btnGray}>
                    İptal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== TOUR SCREEN (your old screen logic, simplified UI) =====
  const meta = tours.find((t) => t.code === activeCode);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              {meta ? `${meta.agency} — ${meta.group}` : activeCode}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              {meta?.dateKey ?? ""} • <b>{activeCode}</b> • Durum: {online ? "🟢 Canlı Sync" : "🟡 Offline"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addPassenger} style={btnGreen}>
              + Kişi
            </button>
            <button onClick={backToDashboard} style={btnGray}>
              ← Turlar
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={statPill}>Toplam: <b>{total}</b></div>
          <div style={statPill}>İçerde: <b>{remaining}</b></div>
          <div style={statPill}>Çıktı: <b>{checkedCount}</b></div>
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            placeholder="İsim ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: p.checked ? "rgba(16,185,129,0.14)" : p.visaFlag ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, textDecoration: p.checked ? "line-through" : "none", opacity: p.checked ? 0.6 : 1 }}>
                  {p.name} {p.dupOf ? <span style={{ fontSize: 11, opacity: 0.75 }}> (aynı isim)</span> : null}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {p.passport ? `🛂 ${p.passport} ` : ""}
                  {p.phone ? ` • 📱 ${p.phone}` : ""}
                  {p.visaFlag ? " • 🚨 Kapı Vize" : ""}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => toggle(p.id)} style={p.checked ? btnGray : btnBlueSmall}>
                  {p.checked ? "Geri Al" : "Çıktı"}
                </button>
                <button onClick={() => toggleVisa(p.id)} style={p.visaFlag ? btnGray : btnRedSmall}>
                  {p.visaFlag ? "Vize Kaldır" : "+ Vize"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.6 }}>
          Not: Offline iken değişiklikler cihazda saklanır; internet gelince Firebase’e gönderilir.
        </div>
      </div>
    </div>
  );
}

/** ===== Simple styles ===== */
const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 16,
};

const modalSheet: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  background: "#1a2744",
  borderRadius: "18px 18px 0 0",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: 16,
};

const btnBlue: React.CSSProperties = {
  flex: 1,
  padding: "12px 12px",
  borderRadius: 12,
  border: 0,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGray: React.CSSProperties = {
  flex: 1,
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGreen: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: 0,
  background: "#10b981",
  color: "#05281d",
  fontWeight: 900,
  cursor: "pointer",
};

const btnBlueSmall: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 12,
  border: 0,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnRedSmall: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 12,
  border: 0,
  background: "#dc2626",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const statPill: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
};
