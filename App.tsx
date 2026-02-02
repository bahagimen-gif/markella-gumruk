import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  passengers: Passenger[];
  ts: number;
};

// =========================
// FIREBASE (REST) CONFIG + OFFLINE SUPPORT
// =========================
const FB = {
  databaseURL: "https://markella-rezervasyon-default-rtdb.europe-west1.firebasedatabase.app",
};

const dbURL = (path: string) => `${FB.databaseURL}/${path}.json`;

// Yardımcı: Veriyi telefonun hafızasına (localStorage) yedekler
const saveLocal = (key: string, data: any) => localStorage.setItem("mk_" + key, JSON.stringify(data));

// Yardımcı: Veriyi telefonun hafızasından geri getirir
const getLocal = (key: string) => {
  const d = localStorage.getItem("mk_" + key);
  return d ? JSON.parse(d) : null;
};

async function fbGet(path: string) {
  try {
    const r = await fetch(dbURL(path));
    if (r.ok) {
      const data = await r.json();
      saveLocal(path, data); // İnternet varsa veriyi yedekle
      return data;
    }
    throw new Error("Bağlantı Hatası");
  } catch (err) {
    // İnternet koptuğunda hafızadaki yedeği açar
    console.log("Offline Mod: Hafızadaki veriler kullanılıyor.");
    return getLocal(path); 
  }
}

async function fbSet(path: string, data: any) {
  try {
    const r = await fetch(dbURL(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      saveLocal(path, data); // Başarılı gönderimi hafızaya da işle
      return true;
    }
    throw new Error("Bağlantı Hatası");
  } catch (err) {
    // İnternet yoksa bile hafızayı güncelle ki 'tik' işareti ekranda kalsın
    saveLocal(path, data);
    console.warn("İnternet yok: İşlem yerel olarak kaydedildi.");
    return true; 
  }
}

function fbListen(path: string, cb: (d: any) => void) {
  let on = true, last = "";
  
  const poll = async () => {
    if (!on) return;

    // --- KONTROL MEKANİZMASI ---
    // Eğer bekleyen (gönderilmeyi bekleyen) bir işlem varsa, Firebase'den veri ÇEKME.
    // Çünkü çekersek, telefondaki o kaydedilmemiş tikler silinir.
    const hasPending = Object.keys(localStorage).some(key => key.startsWith('mk_pending_'));

    if (hasPending && navigator.onLine) {
      // Bekleyen veri varsa listeyi güncelleme, 2 saniye sonra tekrar kontrol et
      if (on) setTimeout(poll, 2000);
      return;
    }

    const d = await fbGet(path); 
    const s = JSON.stringify(d);
    if (s !== last && d !== null) {
      last = s;
      cb(d);
    }
    if (on) setTimeout(poll, 3000);
  };
  poll();
  return () => { on = false; };
}

// =========================
// PARSE (paste)
// =========================
function parseText(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const phoneRe = /(\+?\d[\d\s\-().]{5,}\d)/;
  const ppRe = /\b([A-Za-z]{0,3}\d{6,9}[A-Za-z0-9]{0,2})\b/;

  const out: { name: string; passport: string; phone: string }[] = [];

  lines.forEach((line) => {
    const pm = line.match(phoneRe);
    const phone = pm ? pm[1].trim() : "";
    let rem = line.replace(pm ? pm[0] : "", "");
    const ppm = rem.match(ppRe);
    const passport = ppm ? ppm[1].trim() : "";
    rem = rem
      .replace(ppm ? ppm[0] : "", "")
      .replace(/[-:;,|/]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (rem.length > 1) out.push({ name: rem, passport, phone });
  });

  // Aynı isimleri silmiyoruz (sonradan numaralandırılıyor)
  return out;
}

function genCode() {
  const c = "ABCDEFGHJKLMNPRSTUVYZ23456789";
  let r = "TUR-";
  for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

// =========================
// Sorting + duplicate label
// =========================
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
    return { ...p, name: `${base} (${n})`, dupOf: base, dupIndex: n };
  });
}
function normalizePassengerList(list: Passenger[]) {
  const sorted = sortBySurnameThenName(list);
  return uniquifyByNameWithCounter(sorted);
}

// =========================
// WhatsApp open helper (app first)
// =========================
function openWhatsApp(phoneRaw: string) {
  const cl = (phoneRaw || "").replace(/[\s\-().]/g, "");
  const wa = cl.startsWith("+") ? cl : "+90" + cl.replace(/^0/, "");
  const appUrl = `whatsapp://send?phone=${wa}`;
  const webUrl = `https://api.whatsapp.com/send?phone=${wa}`;

  window.location.href = appUrl;
  setTimeout(() => {
    try {
      window.open(webUrl, "_blank");
    } catch {
      window.location.href = webUrl;
    }
  }, 450);
}

// =========================
// XLSX via CDN (no npm)
// =========================
declare global {
  interface Window {
    XLSX?: any;
  }
}
function loadXLSX(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("XLSX yüklenemedi"));
    document.body.appendChild(script);
  });
}

function normalizeHeader(h: any) {
  return String(h || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_\-]/g, "")
    .replace(/[ıİ]/g, "i");
}
function pickHeaderKey(headers: string[], candidates: string[]) {
  const normMap = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const c of candidates) {
    const k = normalizeHeader(c);
    if (normMap.has(k)) return normMap.get(k) as string;
  }
  const nHeaders = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    const hit = nHeaders.find((h) => h.n.includes(nc) || nc.includes(h.n));
    if (hit) return hit.raw;
  }
  return null;
}
function normalizePhoneTR(raw: any) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("90") && !s.startsWith("+90")) s = "+90" + s.slice(2);
  if (s.startsWith("0")) s = "+90" + s.slice(1);
  if (!s.startsWith("+")) s = "+90" + s;
  return s;
}

async function parseExcelFile(file: File) {
  await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = window.XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (!rows || !rows.length) return { items: [], error: "Excel boş görünüyor." };

  const headers = Object.keys(rows[0] || {});
  const nameKey = pickHeaderKey(headers, ["ad soyad", "adsoyad", "isim soyisim", "isim", "fullname", "name"]);
  const passKey = pickHeaderKey(headers, ["pasaport", "pasaport no", "pasaport numarasi", "passport", "passportno"]);
  const gsmKey = pickHeaderKey(headers, ["gsm", "telefon", "cep", "mobile", "mobil", "phone"]);

  if (!nameKey) return { items: [], error: "Excel içinde 'Ad Soyad' sütunu bulunamadı. (Örn: AD SOYAD)" };

  const out = rows
    .map((r) => {
      const name = String(r[nameKey] || "").trim();
      const passport = passKey ? String(r[passKey] || "").trim() : "";
      const phone = gsmKey ? normalizePhoneTR(r[gsmKey]) : "";
      return { name, passport, phone };
    })
    .filter((x) => x.name && x.name.length > 1);

  return { items: out, error: "" };
}

// =========================
// LocalStorage
// =========================
const LS = {
  tourCode: "mk_tourCode_v1",
  passengers: "mk_passengers_v1",
  tourTs: "mk_tourTs_v1",
  hidden: "mk_listHidden_v1",
};

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// =========================
// COMPONENTS
// =========================
function ConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={{ ...S.sheet, padding: "28px 20px 24px" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={{ fontSize: "40px", textAlign: "center", marginBottom: "10px" }}>⚠️</div>
        <div style={{ ...S.shTitle, textAlign: "center", fontSize: "18px" }}>Mevcut listeyi silmek istiyor musun?</div>
        <div style={{ textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: "8px 0 22px", lineHeight: 1.5 }}>
          Bu işlem geri alınamaz.<br />Tüm müşteri verileri kalıcı olarak silinecek.
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={{ ...S.btn("red"), flex: 1 }} onClick={onConfirm}>
            🗑️ Evet, Sil
          </button>
          <button style={{ ...S.btn("gray"), flex: 1 }} onClick={onCancel}>
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinSheet({ onJoin, onClose }: { onJoin: (code: string, data: any) => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr("");
    setLoading(true);
    const t = code.trim().toUpperCase();
    if (!t.startsWith("TUR-") || t.length !== 8) {
      setErr("Geçersiz tur kodu. Örnek: TUR-A7K9");
      setLoading(false);
      return;
    }
    const d = await fbGet(`tours/${t}`);
    setLoading(false);
    if (!d || !d.passengers || !d.passengers.length) {
      setErr("Bu tur kodu bulunamadı veya boş.");
      return;
    }
    onJoin(t, d);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>🔗 Tur Koduna Katıl</div>
        <div style={S.shHint}>Tur sahibinin paylaştığı kodu gir</div>
        <input
          style={{ ...S.textarea, minHeight: "auto", padding: "14px", fontSize: "22px", textAlign: "center", letterSpacing: "4px", textTransform: "uppercase", fontWeight: 700 }}
          placeholder="TUR-XXXX"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setErr("");
          }}
          autoFocus
        />
        {err && <div style={S.errTxt}>{err}</div>}
        <div style={S.btns}>
          <button style={S.btn("blue")} onClick={handle} disabled={loading}>
            {loading ? "Aranıyor..." : "Katıl"}
          </button>
          <button style={S.btn("gray")} onClick={onClose}>
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

function VisaSheet({
  passenger,
  onToggle,
  onClose,
}: {
  passenger: Passenger;
  onToggle: (id: number, val: boolean) => void;
  onClose: () => void;
}) {
  const hasVisa = passenger.visaFlag;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>{passenger.name}</div>
        <div style={S.shHint}>Bu müşteri için Kapı Vizesi durumunu ayarla</div>
        <div style={S.btns}>
          <button
            style={S.btn(hasVisa ? "gray" : "red")}
            onClick={() => {
              onToggle(passenger.id, true);
              onClose();
            }}
          >
            {hasVisa ? "✓ Kapı Vizesi Var (aktif)" : "🚨 Kapı Vizesi Ekle"}
          </button>
          {hasVisa && (
            <button
              style={S.btn("gray")}
              onClick={() => {
                onToggle(passenger.id, false);
                onClose();
              }}
            >
              ✕ Kapı Vizesi Kaldır
            </button>
          )}
          <button style={S.btn("gray")} onClick={onClose}>
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPassengerSheet({
  onAdd,
  onClose,
}: {
  onAdd: (x: { name: string; passport: string; phone: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [passport, setPassport] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const n = name.trim();
    if (n.length < 2) {
      setErr("İsim gerekli");
      return;
    }
    onAdd({ name: n, passport: passport.trim(), phone: phone.trim() });
    onClose();
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>➕ Listeye Kişi Ekle</div>
        <div style={S.shHint}>Sonradan dışarıdan gelen müşteri ekleyebilirsin.</div>

        <input
          style={{ ...S.textarea, minHeight: "auto", padding: "12px", marginBottom: "10px" }}
          placeholder="Ad Soyad"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr("");
          }}
          autoFocus
        />
        <input
          style={{ ...S.textarea, minHeight: "auto", padding: "12px", marginBottom: "10px" }}
          placeholder="Pasaport Numarası"
          value={passport}
          onChange={(e) => setPassport(e.target.value)}
        />
        <input
          style={{ ...S.textarea, minHeight: "auto", padding: "12px" }}
          placeholder="GSM (opsiyonel)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {err && <div style={S.errTxt}>{err}</div>}

        <div style={S.btns}>
          <button style={S.btn("blue")} onClick={submit}>
            Ekle
          </button>
          <button style={S.btn("gray")} onClick={onClose}>
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

function InsideModal({
  passengers,
  onClose,
  onToggle,
  onVisa,
}: {
  passengers: Passenger[];
  onClose: () => void;
  onToggle: (id: number) => void;
  onVisa: (p: Passenger) => void;
}) {
  const insiders = passengers.filter((p) => !p.checked);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.sheet, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <div style={S.shTitle}>🏢 İçerde Olanlar</div>
          <span style={S.countPill}>{insiders.length}</span>
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "14px" }}>Gümrükten henüz çıkmayan müşteriler</div>

        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "8px" }}>
          {insiders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.35)", fontSize: "14px" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>✅</div>
              Herkes çıktı!
            </div>
          ) : (
            insiders.map((p) => (
              <div key={p.id} style={S.card(false, p.visaFlag)} onClick={() => onToggle(p.id)}>
                {p.visaFlag && <div style={S.visaRibbon}>🚨 Kapı Vize</div>}
                <div style={S.chk(false)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    <div style={S.cName(false)}>{p.name}</div>
                    {p.dupOf && <span style={S.dupBadge}>⚠️ Aynı isim</span>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "5px", flexWrap: "wrap" }}>
                    {p.passport && <span style={S.tag("blue")}>🛂 {p.passport}</span>}
                    {p.phone && (
                      <span
                        style={S.tag("green")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openWhatsApp(p.phone);
                        }}
                      >
                        📱 {p.phone}
                      </span>
                    )}
                    <span
                      style={S.tag(p.visaFlag ? "visa-on" : "visa-off")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onVisa(p);
                      }}
                    >
                      {p.visaFlag ? "🚨 Kapı Vize" : "+ Vize"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <button style={{ ...S.btn("gray"), marginTop: "12px" }} onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}

// =========================
// MAIN
// =========================
export default function App() {
  // İnternet var mı yok mu takibi
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);
  const LOGO = "https://www.markellatravel.com.tr/wp-content/uploads/2024/11/Ege-Markella-Logo-Yatay-1.png";

  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [tourCode, setTourCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showInside, setShowInside] = useState(false);
  const [visaPassenger, setVisaPassenger] = useState<Passenger | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [excelErr, setExcelErr] = useState("");
  const [online, setOnline] = useState(true);

  const [listHidden, setListHidden] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const exitedRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const localTsRef = useRef<number>(0);

  // Load from LocalStorage once
  useEffect(() => {
    const tc = localStorage.getItem(LS.tourCode);
    const ps = safeJsonParse<Passenger[]>(localStorage.getItem(LS.passengers), []);
    const ts = Number(localStorage.getItem(LS.tourTs) || "0");
    const hid = localStorage.getItem(LS.hidden) === "1";

    if (tc) setTourCode(tc);
    if (ps && ps.length) setPassengers(ps);
    if (ts) localTsRef.current = ts;
    setListHidden(hid);
  }, []);

  // Save hidden
  useEffect(() => {
    localStorage.setItem(LS.hidden, listHidden ? "1" : "0");
  }, [listHidden]);

  // Save passengers
  useEffect(() => {
    const ts = localTsRef.current || Date.now();
    localStorage.setItem(LS.passengers, JSON.stringify(passengers));
    localStorage.setItem(LS.tourTs, String(ts));
  }, [passengers]);

  // Save tourCode when active
  useEffect(() => {
    if (!tourCode) return;
    localStorage.setItem(LS.tourCode, tourCode);
  }, [tourCode]);

  // Firebase push
  useEffect(() => {
    if (!tourCode) return;

    const ts = Date.now();
    localTsRef.current = ts;

    const payload: TourPayload = { passengers, ts };
    fbSet(`tours/${tourCode}`, payload).then((ok) => setOnline(ok));
  }, [passengers, tourCode]);

  // Firebase listen
  useEffect(() => {
    if (!tourCode) return;
    const stop = fbListen(`tours/${tourCode}`, (remote: TourPayload | null) => {
      if (!remote || !remote.passengers) return;
      if (typeof remote.ts !== "number") return;

      if (remote.ts >= (localTsRef.current || 0)) {
        setOnline(true);
        localTsRef.current = remote.ts;
        setPassengers(remote.passengers);
      }
    });
    stopRef.current = stop;
    return () => {
      if (stopRef.current) stopRef.current();
    };
  }, [tourCode]);

  // Offline retry
  useEffect(() => {
    if (!tourCode) return;
    const t = setInterval(async () => {
      if (online) return;
      const payload: TourPayload = { passengers, ts: localTsRef.current || Date.now() };
      const ok = await fbSet(`tours/${tourCode}`, payload);
      if (ok) setOnline(true);
    }, 4000);
    return () => clearInterval(t);
  }, [online, tourCode, passengers]);

  const createTour = useCallback(() => {
    const code = genCode();
    setTourCode(code);
    setPassengers([]);
    setShowConfirm(false);
    setShowMenu(false);

    localTsRef.current = Date.now();
    localStorage.setItem(LS.tourCode, code);
    localStorage.setItem(LS.passengers, JSON.stringify([]));
    localStorage.setItem(LS.tourTs, String(localTsRef.current));
  }, []);

  const joinTour = useCallback((code: string, data: any) => {
    setTourCode(code);
    setPassengers(data.passengers || []);
    setShowJoin(false);

    const ts = typeof data.ts === "number" ? data.ts : Date.now();
    localTsRef.current = ts;
    localStorage.setItem(LS.tourCode, code);
    localStorage.setItem(LS.passengers, JSON.stringify(data.passengers || []));
    localStorage.setItem(LS.tourTs, String(ts));
  }, []);

  const setListFromRawItems = useCallback((items: { name: string; passport: string; phone: string }[]) => {
    const now = Date.now();
    const mapped: Passenger[] = items.map((p) => ({
      id: now + Math.random(),
      name: p.name,
      passport: p.passport || "",
      phone: p.phone || "",
      checked: false,
      visaFlag: false,
    }));
    setPassengers(normalizePassengerList(mapped));
  }, []);

  const handleParse = useCallback(() => {
    setParseErr("");
    setExcelErr("");
    const raw = parseText(pasteText);
    if (!raw.length) {
      setParseErr("Hiçbir isim bulunamadı. Kontrol et ve tekrar dene.");
      return;
    }
    setListFromRawItems(raw);
    setPasteText("");
    setShowPaste(false);
  }, [pasteText, setListFromRawItems]);

  const handleExcel = useCallback(
    async (file: File) => {
      setParseErr("");
      setExcelErr("");
      try {
        const { items, error } = await parseExcelFile(file);
        if (error) {
          setExcelErr(error);
          return;
        }
        if (!items.length) {
          setExcelErr("Excel'den isim çekilemedi. Sütunları kontrol et.");
          return;
        }
        setListFromRawItems(items);
        setShowPaste(false);
      } catch {
        setExcelErr("Excel okunamadı. Dosya formatını kontrol et (xlsx/xls).");
      }
    },
    [setListFromRawItems]
  );

  const toggle = useCallback((id: number) => {
    setPassengers((prev) => {
      // 1. Ekranı hemen güncelle
      const newList = normalizePassengerList(
        prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
      );

      // 2. Yolcuyu ve sırasını bul
      const indexInDb = newList.findIndex(p => p.id === id);
      const updatedPassenger = newList[indexInDb];

      // 3. Firebase'e sadece bu değişikliği bildir
      if (updatedPassenger && indexInDb !== -1) {
        fbSet(`turlar/aktifTur/passengers/${indexInDb}/checked`, updatedPassenger.checked);
      }

      return newList;
    });
  }, []);

  const toggleVisa = useCallback((id: number, val: boolean) => {
    setPassengers((prev) => normalizePassengerList(prev.map((p) => (p.id === id ? { ...p, visaFlag: val } : p))));
  }, []);

  const addPassenger = useCallback((x: { name: string; passport: string; phone: string }) => {
    setPassengers((prev) => {
      const now = Date.now() + Math.random();
      const added: Passenger = {
        id: now,
        name: x.name,
        passport: x.passport || "",
        phone: x.phone || "",
        checked: false,
        visaFlag: false,
      };
      return normalizePassengerList([...prev, added]);
    });
  }, []);

  const visaUnchecked = passengers.filter((p) => p.visaFlag && !p.checked);
  const normalUnchecked = passengers.filter((p) => !p.visaFlag && !p.checked);
  const checkedList = passengers.filter((p) => p.checked);
  const sorted = useMemo(() => [...visaUnchecked, ...normalUnchecked, ...checkedList], [visaUnchecked, normalUnchecked, checkedList]);

  const filtered = useMemo(() => sorted.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())), [sorted, search]);

  const visaCount = passengers.filter((p) => p.visaFlag && !p.checked).length;
  const checkedCount = passengers.filter((p) => p.checked).length;
  const total = passengers.length;
  const remaining = total - checkedCount;
  const pct = total ? (checkedCount / total) * 100 : 0;
  const firstCheckedIdx = filtered.findIndex((p) => p.checked);

  // ---- LANDING ----
  if (!tourCode) {
    const hasLast = !!localStorage.getItem(LS.tourCode);

    return (
      <div style={S.app}>
        <div style={S.deco1} />
        <div style={S.deco2} />
        <div style={S.landingWrap}>
          <img src={LOGO} alt="Markella Travel" style={S.landingLogo} />
          <div style={S.landingTitle}>Gümrük Çıkış Check-In Kontrolü</div>
          <div style={S.landingSub}>
            Gümrük çıkışında müşterileri
            <br />
            hızlı ve kolay takip et
          </div>

          <button style={{ ...S.btn("blue"), width: "100%", maxWidth: "280px" }} onClick={createTour}>
            🆕 Yeni Tur Başlat
          </button>

          <button
            style={{ ...S.btn("gray"), width: "100%", maxWidth: "280px", marginTop: "10px", border: "1px solid rgba(255,255,255,0.15)" }}
            onClick={() => setShowJoin(true)}
          >
            🔗 Tur Koduna Katıl
          </button>

          {hasLast && (
            <button
              style={{ ...S.btn("gray"), width: "100%", maxWidth: "280px", marginTop: "10px", border: "1px solid rgba(255,255,255,0.15)" }}
              onClick={() => {
                const tc = localStorage.getItem(LS.tourCode);
                const ps = localStorage.getItem(LS.passengers);
                const ts = localStorage.getItem(LS.tourTs);
                if (tc) setTourCode(tc);
                if (ps) setPassengers(JSON.parse(ps));
                if (ts) localTsRef.current = Number(ts);
              }}
            >
              ↩️ Son Tura Devam Et
            </button>
          )}
        </div>

        {showJoin && <JoinSheet onJoin={joinTour} onClose={() => setShowJoin(false)} />}
      </div>
    );
  }

  // ---- MAIN ----
  return (
    <div style={S.app} onClick={() => setShowMenu(false)}>
      {/* İNTERNET DURUM UYARISI */}
      {!isOnline && (
        <div style={{ 
          backgroundColor: '#d32f2f', 
          color: 'white', 
          textAlign: 'center', 
          padding: '10px', 
          marginBottom: '10px',
          borderRadius: '8px',
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          ⚠️ ŞU AN ÇEVRİMDIŞISINIZ. Kayıtlar internet gelince eşitlenecek.
        </div>
      )}
      <div style={S.deco1} />
      <div style={S.deco2} />

      {/* HEADER */}
      <div style={S.headerSticky}>
        <div style={S.hTop}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img src={LOGO} alt="Markella Travel" style={{ height: "26px", width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.25))" }} />
            <span style={S.hTitle}>Gümrük Çıkış Check-In Kontrolü</span>
          </div>

          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button style={S.menuBtn} onClick={() => setShowMenu(!showMenu)}>
              ⋮
            </button>
            {showMenu && (
              <div style={S.dropdown}>
                <div
                  style={S.menuItem}
                  onClick={() => {
                    navigator.clipboard?.writeText(tourCode);
                    setShowMenu(false);
                  }}
                >
                  📋 Kodu Kopya: {tourCode}
                </div>

                <div
                  style={S.menuItem}
                  onClick={() => {
                    setShowMenu(false);
                    setShowAdd(true);
                  }}
                >
                  ➕ Kişi Ekle
                </div>

                <div
                  style={S.menuItem}
                  onClick={() => {
                    setListHidden((v) => !v);
                    setShowMenu(false);
                  }}
                >
                  {listHidden ? "👀 Listeyi Göster" : "🙈 Listeyi Gizle"}
                </div>

                <div
                  style={S.menuItem}
                  onClick={() => {
                    setShowMenu(false);
                    setShowJoin(true);
                  }}
                >
                  🔗 Başka Tura Katıl
                </div>

                <div
                  style={S.menuItem}
                  onClick={() => {
                    setShowMenu(false);
                    setTourCode(null); // çıkış (liste silinmez)
                  }}
                >
                  🚪 Çıkış Yap
                </div>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />
                <div
                  style={{ ...S.menuItem, color: "#f87171" }}
                  onClick={() => {
                    setShowMenu(false);
                    setShowConfirm(true);
                  }}
                >
                  🗑️ Yeni Tur Başlat / Listeyi Sil
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: online ? "#10b981" : "#f59e0b",
              boxShadow: online ? "0 0 6px rgba(16,185,129,0.5)" : "none",
              transition: "all 0.3s",
            }}
          />
          <span style={{ fontSize: "11px", color: online ? "rgba(16,185,129,0.8)" : "rgba(245,158,11,0.8)" }}>
            {online ? "Canlı Sync" : "Çevrimdışı (değişiklikler kaybolmaz)"}
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)", marginLeft: "auto", letterSpacing: "1px" }}>{tourCode}</span>
        </div>

        {/* Visa Banner */}
        {visaCount > 0 && (
          <div style={S.visaBanner}>
            <span style={{ fontSize: "18px" }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Kapı Vizesi Beklenyen</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "2px" }}>{visaCount} kişi geç çıkabilir</div>
            </div>
            <span style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>{visaCount}</span>
          </div>
        )}

        {/* Progress + Stats */}
        {total > 0 && (
          <>
            <div style={S.progBar}>
              <div style={{ ...S.progFill, width: `${pct}%` }} />
            </div>
            <div style={S.statsRow}>
              <div style={S.statCard}>
                <div style={S.statNum}>{total}</div>
                <div style={S.statLbl}>Toplam</div>
              </div>

              <div
                style={{
                  ...S.statCard,
                  cursor: checkedCount > 0 ? "pointer" : "default",
                  border: checkedCount > 0 ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.07)",
                }}
                onClick={checkedCount > 0 ? () => exitedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined}
              >
                <div style={{ ...S.statNum, color: "#10b981" }}>{checkedCount}</div>
                <div style={S.statLbl}>↓ Çıktı</div>
              </div>

              <div
                style={{
                  ...S.statCard,
                  cursor: remaining > 0 ? "pointer" : "default",
                  border: remaining > 0 ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.07)",
                }}
                onClick={remaining > 0 ? () => setShowInside(true) : undefined}
              >
                <div style={{ ...S.statNum, color: "#f59e0b" }}>{remaining}</div>
                <div style={S.statLbl}>İçerde →</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* BODY */}
      <div style={S.bodyWithStickyHeader}>
        {listHidden ? (
          <div style={S.hiddenBox}>
            <div style={{ fontSize: "34px", marginBottom: "10px" }}>🙈</div>
            <div style={{ fontSize: "14px", lineHeight: 1.6, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>Liste gizlendi</div>
            <div style={{ fontSize: "12px", marginTop: "6px", color: "rgba(255,255,255,0.4)" }}>
              Menüden <b>“Listeyi Göster”</b> diyerek geri açabilirsin.
            </div>
          </div>
        ) : (
          <>
            {total > 0 && (
              <div style={S.searchWrap}>
                <span style={S.searchIco}>🔍</span>
                <input type="text" placeholder="İsim ara..." value={search} onChange={(e) => setSearch(e.target.value)} style={S.searchInput} />
              </div>
            )}

            {total === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>📋</div>
                <div style={{ fontSize: "15px", lineHeight: 1.6 }}>
                  Liste boş.<br />
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>+ butonuna bas ve müşteri listeni ekle.</span>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ ...S.empty, padding: "40px 20px" }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</div>
                <div style={{ fontSize: "14px" }}>"{search}" — sonuç bulunamadı</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {filtered.map((p, i) => {
                  const isFirstChecked = i === firstCheckedIdx;
                  return (
                    <div key={p.id}>
                      {isFirstChecked && checkedCount > 0 && (
                        <div ref={exitedRef} style={S.divider}>
                          <div style={S.divLine} />
                          <span style={S.divTxt}>✓ Çıkanlar ({checkedCount})</span>
                          <div style={S.divLine} />
                        </div>
                      )}

                      <div style={S.card(p.checked, p.visaFlag)} onClick={() => toggle(p.id)}>
                        {p.visaFlag && !p.checked && <div style={S.visaRibbon}>🚨 Kapı Vize</div>}
                        <div style={S.chk(p.checked)}>{p.checked && <span style={{ color: "#fff", fontSize: "14px", fontWeight: "bold" }}>✓</span>}</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                            <div style={S.cName(p.checked)}>{p.name}</div>
                            {p.dupOf && <span style={S.dupBadge}>⚠️ Aynı isim</span>}
                          </div>

                          <div style={{ display: "flex", gap: "8px", marginTop: "5px", flexWrap: "wrap" }}>
                            {p.passport && <span style={S.tag("blue")}>🛂 {p.passport}</span>}

                            {p.phone && (
                              <span
                                style={S.tag("green")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWhatsApp(p.phone);
                                }}
                              >
                                📱 {p.phone}
                              </span>
                            )}

                            <span
                              style={S.tag(p.visaFlag ? "visa-on" : "visa-off")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setVisaPassenger(p);
                              }}
                            >
                              {p.visaFlag ? "🚨 Kapı Vize" : "+ Vize"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <button style={S.fab} onClick={() => setShowPaste(true)}>
        +
      </button>

      {/* MODALS */}
      {showPaste && (
        <div
          style={S.overlay}
          onClick={() => {
            setShowPaste(false);
            setExcelErr("");
            setParseErr("");
          }}
        >
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.handle} />
            <div style={S.shTitle}>📋 Liste Ekle</div>
            <div style={S.shHint}>Excel yükleyebilir veya manuel yapıştırabilirsin.</div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  if (f) handleExcel(f);
                  e.target.value = "";
                }}
              />
              <button
                style={{ ...S.btn("gray"), flex: 1 }}
                onClick={() => {
                  setExcelErr("");
                  fileRef.current?.click();
                }}
              >
                📎 Excel Yükle
              </button>
            </div>

            {excelErr && <div style={S.errTxt}>{excelErr}</div>}

            <textarea
              style={S.textarea}
              placeholder={"Örnek:\nAli Yılmaz TR123456789 0532 123 4567\nAyşe Kaya 987654321 +90 533 987 6543"}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setParseErr("");
                setExcelErr("");
              }}
              autoFocus
            />
            {parseErr && <div style={S.errTxt}>{parseErr}</div>}

            <div style={S.btns}>
              <button style={S.btn("blue")} onClick={handleParse}>
                Listeyi Oluştur
              </button>
              <button
                style={S.btn("gray")}
                onClick={() => {
                  setShowPaste(false);
                  setParseErr("");
                  setExcelErr("");
                }}
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmDialog
          onConfirm={() => {
            createTour();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {showJoin && <JoinSheet onJoin={joinTour} onClose={() => setShowJoin(false)} />}
      {showAdd && <AddPassengerSheet onAdd={addPassenger} onClose={() => setShowAdd(false)} />}
      {visaPassenger && <VisaSheet passenger={visaPassenger} onToggle={toggleVisa} onClose={() => setVisaPassenger(null)} />}
      {showInside && <InsideModal passengers={passengers} onClose={() => setShowInside(false)} onToggle={toggle} onVisa={(p) => setVisaPassenger(p)} />}
    </div>
  );
}

// ===================== STYLES =====================
const S: any = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(145deg, #0f1729 0%, #1a2744 50%, #0f1e3a 100%)",
    color: "#e8edf5",
    fontFamily: "'Segoe UI','Helvetica Neue',sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  deco1: {
    position: "absolute",
    top: "-120px",
    right: "-120px",
    width: "320px",
    height: "320px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  deco2: {
    position: "absolute",
    bottom: "-80px",
    left: "-80px",
    width: "240px",
    height: "240px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },

  landingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "40px 24px",
    textAlign: "center",
    position: "relative",
    zIndex: 1,
  },
  landingLogo: {
    height: "54px",
    width: "auto",
    marginBottom: "18px",
    filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.35))",
  },
  landingTitle: { fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "8px" },
  landingSub: { fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "40px", lineHeight: 1.6, maxWidth: "260px" },

  headerSticky: {
    position: "sticky",
    top: 0,
    zIndex: 999,
    background: "linear-gradient(135deg, rgba(30,50,90,0.98), rgba(20,35,70,0.98))",
    borderBottom: "1px solid rgba(59,130,246,0.15)",
    padding: "20px 20px 16px",
    backdropFilter: "blur(8px)",
  },
  hTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" },
  hTitle: { fontSize: "18px", fontWeight: 800, letterSpacing: "-0.4px", color: "#fff" },

  menuBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#fff",
    width: "34px",
    height: "34px",
    fontSize: "18px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    position: "absolute",
    top: "40px",
    right: "0",
    background: "#1e3356",
    border: "1px solid rgba(59,130,246,0.2)",
    borderRadius: "10px",
    minWidth: "240px",
    padding: "6px 0",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    zIndex: 200,
  },
  menuItem: { padding: "10px 16px", fontSize: "13px", color: "rgba(255,255,255,0.8)", cursor: "pointer", whiteSpace: "nowrap" },

  visaBanner: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "linear-gradient(135deg, rgba(220,38,38,0.25), rgba(185,28,28,0.2))",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: "10px",
    padding: "10px 14px",
    marginBottom: "12px",
    boxShadow: "0 0 16px rgba(220,38,38,0.15)",
  },

  progBar: { width: "100%", height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden", marginBottom: "14px" },
  progFill: { height: "100%", background: "linear-gradient(90deg, #3b82f6, #10b981)", borderRadius: "3px", transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" },

  statsRow: { display: "flex", gap: "10px" },
  statCard: { flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "8px 6px", textAlign: "center", transition: "border 0.2s" },
  statNum: { fontSize: "20px", fontWeight: 700, color: "#fff" },
  statLbl: { fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" },

  // header altına boşluk
  bodyWithStickyHeader: { padding: "24px 16px 120px", position: "relative", zIndex: 1, maxWidth: "540px", margin: "0 auto" },

  searchWrap: { position: "relative", marginBottom: "14px" },
  searchInput: { width: "100%", padding: "13px 16px 13px 44px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "15px", outline: "none", boxSizing: "border-box" },
  searchIco: { position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", fontSize: "18px", pointerEvents: "none" },

  empty: { textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.35)" },

  hiddenBox: {
    textAlign: "center",
    padding: "60px 20px",
    color: "rgba(255,255,255,0.35)",
    border: "1px dashed rgba(255,255,255,0.18)",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.03)",
  },

  divider: { display: "flex", alignItems: "center", gap: "10px", padding: "16px 0 8px", marginTop: "4px" },
  divLine: { flex: 1, height: "1px", background: "rgba(16,185,129,0.25)" },
  divTxt: { fontSize: "12px", color: "rgba(16,185,129,0.7)", fontWeight: 600, whiteSpace: "nowrap" },

  card: (c: boolean, v: boolean) => ({
    background: c ? "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.04))" : v ? "linear-gradient(135deg, rgba(220,38,38,0.18), rgba(185,28,28,0.08))" : "rgba(255,255,255,0.05)",
    border: c ? "1px solid rgba(16,185,129,0.25)" : v ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "12px 13px",
    paddingTop: v && !c ? "28px" : "12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    cursor: "pointer",
    transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
    position: "relative",
    overflow: "hidden",
    boxShadow: v && !c ? "0 0 12px rgba(220,38,38,0.12)" : "none",
  }),

  visaRibbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    background: "linear-gradient(90deg, rgba(220,38,38,0.4), rgba(185,28,28,0.25))",
    borderBottom: "1px solid rgba(239,68,68,0.3)",
    padding: "3px 10px",
    fontSize: "10px",
    fontWeight: 700,
    color: "#fca5a5",
    letterSpacing: "0.5px",
    borderRadius: "12px 12px 0 0",
  },

  chk: (c: boolean) => ({
    width: "24px",
    height: "24px",
    minWidth: "24px",
    borderRadius: "7px",
    border: c ? "none" : "2px solid rgba(255,255,255,0.3)",
    background: c ? "linear-gradient(135deg,#10b981,#059669)" : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    boxShadow: c ? "0 2px 8px rgba(16,185,129,0.3)" : "none",
  }),

  cName: (c: boolean) => ({
    fontSize: "15px",
    fontWeight: 600,
    color: c ? "rgba(255,255,255,0.4)" : "#fff",
    textDecoration: c ? "line-through" : "none",
    transition: "color 0.2s",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),

  dupBadge: {
    fontSize: "10px",
    fontWeight: 800,
    color: "#fbbf24",
    background: "rgba(251,191,36,0.12)",
    border: "1px solid rgba(251,191,36,0.25)",
    padding: "2px 6px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  },

  tag: (color: string) => {
    const m: any = {
      blue: { bg: "rgba(59,130,246,0.12)", txt: "#60a5fa", bd: "rgba(59,130,246,0.2)" },
      green: { bg: "rgba(16,185,129,0.12)", txt: "#34d399", bd: "rgba(16,185,129,0.2)" },
      "visa-on": { bg: "rgba(220,38,38,0.2)", txt: "#fca5a5", bd: "rgba(239,68,68,0.4)" },
      "visa-off": { bg: "rgba(255,255,255,0.05)", txt: "rgba(255,255,255,0.35)", bd: "rgba(255,255,255,0.12)" },
    };
    const c = m[color] || m.blue;
    return {
      fontSize: "11px",
      fontWeight: 500,
      borderRadius: "6px",
      padding: "2px 8px",
      background: c.bg,
      color: c.txt,
      border: `1px solid ${c.bd}`,
      cursor: "pointer",
      userSelect: "none",
      WebkitUserSelect: "none",
    };
  },

  countPill: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#f59e0b",
    background: "rgba(245,158,11,0.15)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: "12px",
    padding: "2px 10px",
  },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#1a2744", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "540px", padding: "20px", border: "1px solid rgba(59,130,246,0.2)", borderBottom: "none" },
  handle: { width: "40px", height: "4px", background: "rgba(255,255,255,0.2)", borderRadius: "2px", margin: "0 auto 18px" },

  shTitle: { fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px" },
  shHint: { fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "14px", lineHeight: 1.5 },

  btns: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "14px" },
  btn: (color: string) => ({
    display: "block",
    width: "100%",
    padding: "13px",
    background: color === "green" ? "linear-gradient(135deg,#16a34a,#15803d)" : color === "blue" ? "linear-gradient(135deg,#3b82f6,#2563eb)" : color === "red" ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "rgba(255,255,255,0.07)",
    border: color === "gray" ? "1px solid rgba(255,255,255,0.12)" : "none",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "center",
    boxShadow: color !== "gray" ? `0 4px 14px ${color === "green" ? "rgba(22,163,74,0.3)" : color === "red" ? "rgba(220,38,38,0.3)" : "rgba(59,130,246,0.3)"}` : "none",
  }),

  textarea: { width: "100%", minHeight: "140px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", color: "#fff", fontSize: "14px", padding: "12px", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  errTxt: { color: "#f87171", fontSize: "12px", marginTop: "8px" },

  fab: { position: "fixed", bottom: "30px", right: "24px", width: "58px", height: "58px", borderRadius: "16px", background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", fontSize: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 24px rgba(59,130,246,0.4)", zIndex: 900 },
};
