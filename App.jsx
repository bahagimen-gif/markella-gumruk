import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

// =========================
// 1. CONFIG & TYPES
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyCFZ6oTzPNrA8v2Zk7oRBz8LJ3VEU-ldR8",
  authDomain: "markella-rezervasyon.firebaseapp.com",
  databaseURL: "https://markella-rezervasyon-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "markella-rezervasyon",
  storageBucket: "markella-rezervasyon.firebasestorage.app",
  messagingSenderId: "1025094372154",
  appId: "1:1025094372154:web:2a21288e33afeff7799e03"
};

const LS = {
  tourCode: "markella_tourCode",
  passengers: "markella_passengers",
  tourTs: "markella_tourTs",
  hidden: "markella_hidden"
};

interface Passenger {
  id: number;
  name: string;
  passport: string;
  phone: string;
  checked: boolean;
  visaFlag: boolean;
  dupOf?: boolean;
}

interface TourPayload {
  passengers: Passenger[];
  ts: number;
}

// =========================
// 2. HELPERS (PARSE & SYNC)
// =========================
const safeJsonParse = <T,>(val: string | null, def: T): T => {
  try { return val ? JSON.parse(val) : def; } catch { return def; }
};

const genCode = () => "TUR-" + Math.random().toString(36).substring(2, 6).toUpperCase();

const normalizePassengerList = (list: Passenger[]): Passenger[] => {
  const names = list.map(p => p.name.trim().toLowerCase());
  return list.map(p => ({
    ...p,
    dupOf: names.filter(n => n === p.name.trim().toLowerCase()).length > 1
  }));
};

const openWhatsApp = (phone: string) => {
  const clean = phone.replace(/\D/g, "");
  const target = clean.startsWith("90") ? clean : clean.startsWith("0") ? "90" + clean.substring(1) : "90" + clean;
  window.open(`https://wa.me/${target}`, "_blank");
};

// FIREBASE BRIDGE
const fbSet = async (path: string, val: any) => {
  try {
    const r = await fetch(`${firebaseConfig.databaseURL}/${path}.json`, {
      method: "PUT",
      body: JSON.stringify(val)
    });
    return r.ok;
  } catch { return false; }
};

const fbListen = (path: string, cb: (data: any) => void) => {
  let active = true;
  const poll = async () => {
    while (active) {
      try {
        const r = await fetch(`${firebaseConfig.databaseURL}/${path}.json`);
        if (r.ok) cb(await r.json());
      } catch (e) {}
      await new Promise(res => setTimeout(res, 3000));
    }
  };
  poll();
  return () => { active = false; };
};

// EXCEL PARSER
const parseExcelFile = async (file: File): Promise<{ items: any[], error: string }> => {
  return new Promise((res) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const b = e.target?.result;
        const wb = XLSX.read(b, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const items = data.slice(1).map(row => ({
          name: String(row[0] || "").trim(),
          passport: String(row[1] || "").trim(),
          phone: String(row[2] || "").trim()
        })).filter(x => x.name.length > 2);
        res({ items, error: "" });
      } catch { res({ items: [], error: "Excel okunurken hata!" }); }
    };
    reader.readAsBinaryString(file);
  });
};

const parseText = (txt: string) => {
  return txt.split("\n").map(l => {
    const p = l.trim().split(/\s+/);
    if (p.length < 2) return null;
    return { name: p.slice(0, 2).join(" "), passport: p[2] || "", phone: p.slice(3).join("") };
  }).filter(Boolean) as any[];
};

// =========================
// 3. COMPONENTS
// =========================
function ConfirmDialog({ onConfirm, onCancel }: any) {
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>⚠️ Emin misiniz?</div>
        <div style={S.shHint}>Bu işlem mevcut tüm listeyi siler ve yeni bir tur kodu oluşturur.</div>
        <div style={S.btns}>
          <button style={S.btn("red")} onClick={onConfirm}>Evet, Her Şeyi Sil</button>
          <button style={S.btn("gray")} onClick={onCancel}>Vazgeç</button>
        </div>
      </div>
    </div>
  );
}

function JoinSheet({ onJoin, onClose }: any) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const go = async () => {
    if (!val) return;
    const r = await fetch(`${firebaseConfig.databaseURL}/tours/${val.toUpperCase()}.json`);
    const data = await r.json();
    if (data) onJoin(val.toUpperCase(), data); else setErr("Tur bulunamadı!");
  };
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>🔗 Tur Koduna Katıl</div>
        <input style={S.textarea} placeholder="Örn: TUR-A1B2" value={val} onChange={e => setVal(e.target.value)} />
        {err && <div style={S.errTxt}>{err}</div>}
        <div style={S.btns}>
          <button style={S.btn("blue")} onClick={go}>Bağlan</button>
          <button style={S.btn("gray")} onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

function AddPassengerSheet({ onAdd, onClose }: any) {
  const [f, setF] = useState({ name: "", passport: "", phone: "" });
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={S.handle} />
        <div style={S.shTitle}>➕ Kişi Ekle</div>
        <input style={{...S.textarea, minHeight: "45px", marginBottom: "8px"}} placeholder="Ad Soyad" onChange={e => setF({...f, name: e.target.value})} />
        <input style={{...S.textarea, minHeight: "45px", marginBottom: "8px"}} placeholder="Pasaport" onChange={e => setF({...f, passport: e.target.value})} />
        <input style={{...S.textarea, minHeight: "45px"}} placeholder="Telefon" onChange={e => setF({...f, phone: e.target.value})} />
        <div style={S.btns}>
          <button style={S.btn("blue")} onClick={() => { if(f.name) onAdd(f); onClose(); }}>Ekle</button>
          <button style={S.btn("gray")} onClick={onClose}>İptal</button>
        </div>
      </div>
    </div>
  );
}

// =========================
// 4. MAIN APP
// =========================
export default function App() {
  const LOGO = "https://www.markellatravel.com.tr/wp-content/uploads/2024/11/Ege-Markella-Logo-Yatay-1.png";
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [tourCode, setTourCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [online, setOnline] = useState(true);
  const [listHidden, setListHidden] = useState(false);
  const [parseErr, setParseErr] = useState("");
  const [excelErr, setExcelErr] = useState("");

  const localTsRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const exitedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tc = localStorage.getItem(LS.tourCode);
    const ps = safeJsonParse<Passenger[]>(localStorage.getItem(LS.passengers), []);
    const ts = Number(localStorage.getItem(LS.tourTs) || "0");
    if (tc) setTourCode(tc);
    if (ps.length) setPassengers(ps);
    localTsRef.current = ts;
    setListHidden(localStorage.getItem(LS.hidden) === "1");
  }, []);

  useEffect(() => {
    if (!tourCode) return;
    localStorage.setItem(LS.tourCode, tourCode);
    localStorage.setItem(LS.passengers, JSON.stringify(passengers));
    localStorage.setItem(LS.tourTs, String(localTsRef.current));
    localStorage.setItem(LS.hidden, listHidden ? "1" : "0");
    
    fbSet(`tours/${tourCode}`, { passengers, ts: localTsRef.current });
  }, [passengers, tourCode, listHidden]);

  useEffect(() => {
    if (!tourCode) return;
    return fbListen(`tours/${tourCode}`, (remote: TourPayload | null) => {
      if (remote && remote.ts > localTsRef.current) {
        localTsRef.current = remote.ts;
        setPassengers(remote.passengers);
        setOnline(true);
      }
    });
  }, [tourCode]);

  const createTour = () => {
    const code = genCode();
    setTourCode(code);
    setPassengers([]);
    localTsRef.current = Date.now();
    setShowConfirm(false);
  };

  const handleExcel = async (file: File) => {
    const { items, error } = await parseExcelFile(file);
    if (error) setExcelErr(error);
    else {
      const mapped = items.map(p => ({ id: Date.now() + Math.random(), name: p.name, passport: p.passport, phone: p.phone, checked: false, visaFlag: false }));
      setPassengers(normalizePassengerList(mapped));
      setShowPaste(false);
    }
  };

  const toggle = (id: number) => {
    localTsRef.current = Date.now();
    setPassengers(prev => normalizePassengerList(prev.map(p => p.id === id ? { ...p, checked: !p.checked } : p)));
  };

  const toggleVisa = (id: number) => {
    localTsRef.current = Date.now();
    setPassengers(prev => normalizePassengerList(prev.map(p => p.id === id ? { ...p, visaFlag: !p.visaFlag } : p)));
  };

  const filtered = useMemo(() => {
    const sorted = [
      ...passengers.filter(p => p.visaFlag && !p.checked),
      ...passengers.filter(p => !p.visaFlag && !p.checked),
      ...passengers.filter(p => p.checked)
    ];
    return sorted.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [passengers, search]);

  const visaCount = passengers.filter(p => p.visaFlag && !p.checked).length;
  const checkedCount = passengers.filter(p => p.checked).length;
  const total = passengers.length;
  const pct = total ? (checkedCount / total) * 100 : 0;

  if (!tourCode) {
    return (
      <div style={S.app}>
        <div style={S.landingWrap}>
          <img src={LOGO} style={S.landingLogo} alt="Logo" />
          <div style={S.landingTitle}>Gümrük Çıkış Kontrolü</div>
          <div style={S.landingSub}>Hızlı, canlı ve güvenli yolcu takibi.</div>
          <button style={{...S.btn("blue"), maxWidth: "280px"}} onClick={createTour}>🆕 Yeni Tur Başlat</button>
          <button style={{...S.btn("gray"), maxWidth: "280px", marginTop: "12px"}} onClick={() => setShowJoin(true)}>🔗 Tur Koduna Katıl</button>
        </div>
        {showJoin && <JoinSheet onJoin={(c:any, d:any) => { setTourCode(c); setPassengers(d.passengers); }} onClose={() => setShowJoin(false)} />}
      </div>
    );
  }

  return (
    <div style={S.app} onClick={() => setShowMenu(false)}>
      <div style={S.headerSticky}>
        <div style={S.hTop}>
          <img src={LOGO} style={{height: "24px"}} alt="Logo" />
          <button style={S.menuBtn} onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}>⋮</button>
          {showMenu && (
            <div style={S.dropdown}>
              <div style={S.menuItem} onClick={() => { navigator.clipboard.writeText(tourCode); alert("Kod kopyalandı!"); }}>📋 Kod: {tourCode}</div>
              <div style={S.menuItem} onClick={() => setListHidden(!listHidden)}>{listHidden ? "👀 Göster" : "🙈 Gizle"}</div>
              <div style={{...S.menuItem, color: "#f87171"}} onClick={() => setShowConfirm(true)}>🗑️ Sıfırla</div>
            </div>
          )}
        </div>
        
        <div style={{display: "flex", gap: "8px", marginBottom: "12px", fontSize: "11px"}}>
           <span style={{color: online ? "#10b981" : "#f59e0b"}}>● {online ? "Canlı" : "Bağlanıyor..."}</span>
           <span style={{marginLeft: "auto", opacity: 0.5}}>{tourCode}</span>
        </div>

        {visaCount > 0 && (
          <div style={S.visaBanner}>
            <span style={{fontSize: "20px"}}>🚨</span>
            <div><b>Kapı Vizesi: {visaCount} kişi</b></div>
          </div>
        )}

        <div style={S.progBar}><div style={{...S.progFill, width: `${pct}%`}} /></div>
        <div style={S.statsRow}>
          <div style={S.statCard}><div style={S.statNum}>{total}</div><div style={S.statLbl}>TOPLAM</div></div>
          <div style={S.statCard}><div style={{...S.statNum, color: "#10b981"}}>{checkedCount}</div><div style={S.statLbl}>ÇIKTI</div></div>
          <div style={S.statCard}><div style={{...S.statNum, color: "#f59e0b"}}>{total - checkedCount}</div><div style={S.statLbl}>İÇERDE</div></div>
        </div>
      </div>

      <div style={S.bodyWithStickyHeader}>
        {listHidden ? (
          <div style={S.hiddenBox}>Liste Gizli</div>
        ) : (
          <>
            <div style={S.searchWrap}>
              <span style={S.searchIco}>🔍</span>
              <input style={S.searchInput} placeholder="Yolcu ara..." onChange={e => setSearch(e.target.value)} />
            </div>
            {filtered.map((p, i) => (
              <div key={p.id} style={{marginBottom: "8px"}}>
                <div style={S.card(p.checked, p.visaFlag)} onClick={() => toggle(p.id)}>
                  {p.visaFlag && !p.checked && <div style={S.visaRibbon}>🚨 KAPI VİZESİ</div>}
                  <div style={S.chk(p.checked)}>{p.checked && "✓"}</div>
                  <div style={{flex: 1}}>
                    <div style={S.cName(p.checked)}>{p.name} {p.dupOf && "⚠️"}</div>
                    <div style={{display: "flex", gap: "6px", marginTop: "4px"}}>
                       {p.passport && <span style={S.tag("blue")}>🛂 {p.passport}</span>}
                       {p.phone && <span style={S.tag("green")} onClick={(e) => { e.stopPropagation(); openWhatsApp(p.phone); }}>📱 WP</span>}
                       <span style={S.tag(p.visaFlag ? "visa-on" : "visa-off")} onClick={(e) => { e.stopPropagation(); toggleVisa(p.id); }}>{p.visaFlag ? "Vize Sil" : "+ Vize"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <button style={S.fab} onClick={() => setShowPaste(true)}>+</button>

      {showPaste && (
        <div style={S.overlay} onClick={() => setShowPaste(false)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.handle} />
            <div style={S.shTitle}>Yolcu Ekle</div>
            <button style={{...S.btn("gray"), marginBottom: "12px"}} onClick={() => fileRef.current?.click()}>📎 Excel Yükle</button>
            <input type="file" ref={fileRef} style={{display: "none"}} onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
            <textarea style={S.textarea} placeholder="İsim Pasaport Telefon..." onChange={e => setPasteText(e.target.value)} />
            <div style={S.btns}>
              <button style={S.btn("blue")} onClick={() => { 
                const items = parseText(pasteText);
                const mapped = items.map(p => ({ id: Date.now() + Math.random(), name: p.name, passport: p.passport, phone: p.phone, checked: false, visaFlag: false }));
                setPassengers(prev => normalizePassengerList([...prev, ...mapped]));
                setShowPaste(false);
              }}>Listeye Ekle</button>
            </div>
          </div>
        </div>
      )}
      {showConfirm && <ConfirmDialog onConfirm={createTour} onCancel={() => setShowConfirm(false)} />}
    </div>
  );
}

// =========================
// 5. STYLES (AS PROVIDED)
// =========================
const S: any = {
  app: { minHeight: "100vh", background: "linear-gradient(145deg, #0f1729 0%, #1a2744 50%, #0f1e3a 100%)", color: "#e8edf5", fontFamily: "sans-serif", position: "relative", overflowX: "hidden" },
  landingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "40px 24px", textAlign: "center" },
  landingLogo: { height: "54px", marginBottom: "18px" },
  landingTitle: { fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "8px" },
  landingSub: { fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "40px" },
  headerSticky: { position: "sticky", top: 0, zIndex: 999, background: "rgba(30,50,90,0.95)", borderBottom: "1px solid rgba(59,130,246,0.15)", padding: "20px", backdropFilter: "blur(8px)" },
  hTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" },
  menuBtn: { background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "8px", color: "#fff", width: "34px", height: "34px", fontSize: "18px" },
  dropdown: { position: "absolute", top: "50px", right: "20px", background: "#1e3356", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "10px", minWidth: "180px", zIndex: 1000 },
  menuItem: { padding: "12px 16px", fontSize: "13px", color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  visaBanner: { background: "rgba(220,38,38,0.2)", border: "1px solid #ef4444", borderRadius: "10px", padding: "10px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" },
  progBar: { height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden", marginBottom: "12px" },
  progFill: { height: "100%", background: "#10b981", transition: "width 0.4s" },
  statsRow: { display: "flex", gap: "10px" },
  statCard: { flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.1)" },
  statNum: { fontSize: "20px", fontWeight: 700 },
  statLbl: { fontSize: "9px", opacity: 0.5, marginTop: "4px" },
  bodyWithStickyHeader: { padding: "20px" },
  searchWrap: { position: "relative", marginBottom: "16px" },
  searchInput: { width: "100%", padding: "12px 12px 12px 40px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#fff" },
  searchIco: { position: "absolute", left: "12px", top: "12px", opacity: 0.3 },
  card: (c: boolean, v: boolean) => ({
    background: c ? "rgba(16,185,129,0.1)" : v ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.05)",
    border: c ? "1px solid #10b981" : v ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px", padding: "12px", display: "flex", alignItems: "center", gap: "12px", position: "relative", overflow: "hidden"
  }),
  chk: (c: boolean) => ({ width: "22px", height: "22px", border: "2px solid #4ade80", borderRadius: "6px", background: c ? "#10b981" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }),
  visaRibbon: { position: "absolute", top: 0, left: 0, right: 0, background: "#ef4444", fontSize: "9px", color: "#fff", textAlign: "center", fontWeight: "bold", padding: "2px" },
  cName: (c: boolean) => ({ fontSize: "15px", fontWeight: 600, textDecoration: c ? "line-through" : "none", opacity: c ? 0.5 : 1 }),
  tag: (color: string) => ({
    fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
    background: color === "blue" ? "rgba(59,130,246,0.1)" : color === "green" ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
    color: color === "blue" ? "#60a5fa" : color === "green" ? "#34d399" : "#fca5a5",
    border: "1px solid rgba(255,255,255,0.1)"
  }),
  fab: { position: "fixed", bottom: "24px", right: "24px", width: "56px", height: "56px", borderRadius: "16px", background: "#3b82f6", color: "#fff", fontSize: "24px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", zIndex: 2000 },
  sheet: { background: "#1a2744", width: "100%", borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "24px" },
  handle: { width: "40px", height: "4px", background: "rgba(255,255,255,0.2)", borderRadius: "2px", margin: "0 auto 16px" },
  shTitle: { fontSize: "18px", fontWeight: 700, marginBottom: "12px" },
  shHint: { fontSize: "13px", opacity: 0.5, marginBottom: "20px" },
  btns: { display: "flex", flexDirection: "column", gap: "10px" },
  btn: (color: string) => ({ padding: "14px", borderRadius: "10px", border: "none", color: "#fff", fontWeight: "bold", background: color === "blue" ? "#3b82f6" : color === "red" ? "#ef4444" : "rgba(255,255,255,0.1)" }),
  textarea: { width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "12px", color: "#fff", minHeight: "100px" },
  errTxt: { color: "#ef4444", fontSize: "12px", marginTop: "8px" }
};
