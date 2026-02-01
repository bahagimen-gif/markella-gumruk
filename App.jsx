import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, FileText, TrendingUp, Download, 
  CheckCircle2, AlertCircle, Save, Database 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";

// --- FİREBASE AYARLARI ---
// Buradaki bilgileri kendi Firebase konsolundan aldığın bilgilerle değiştirebilirsin
const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "markella-gumruk.firebaseapp.com",
  projectId: "markella-gumruk",
  storageBucket: "markella-gumruk.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const [activeTab, setActiveTab] = useState('hesaplama');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Vergi kalemleri state
  const [inputs, setInputs] = useState({
    esyaBedeli: '',
    navlun: '',
    sigorta: '',
    gumrukVergiOrani: 20,
    kdvOrani: 20,
    oivOrani: 0,
    ekMaliYukumluluk: 0,
    digerGiderler: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  // Hesaplama Mantığı
  const calculations = useMemo(() => {
    const bedel = parseFloat(inputs.esyaBedeli) || 0;
    const navlun = parseFloat(inputs.navlun) || 0;
    const sigorta = parseFloat(inputs.sigorta) || 0;
    
    const cifBedel = bedel + navlun + sigorta;
    const gumrukVergisi = (cifBedel * inputs.gumrukVergiOrani) / 100;
    const oiv = ((cifBedel + gumrukVergisi) * inputs.oivOrani) / 100;
    
    const kdvMatrahi = cifBedel + gumrukVergisi + oiv + (parseFloat(inputs.ekMaliYukumluluk) || 0);
    const kdv = (kdvMatrahi * inputs.kdvOrani) / 100;
    
    const toplamVergi = gumrukVergisi + kdv + oiv + (parseFloat(inputs.ekMaliYukumluluk) || 0);
    const maliyet = cifBedel + toplamVergi + (parseFloat(inputs.digerGiderler) || 0);

    return { cifBedel, gumrukVergisi, kdv, oiv, toplamVergi, maliyet };
  }, [inputs]);

  // Veriyi Firebase'e Kaydetme
  const saveToFirebase = async () => {
    setLoading(true);
    try {
      await addDoc(collection(db, "hesaplamalar"), {
        ...inputs,
        ...calculations,
        tarih: new Date().toISOString()
      });
      alert("Hesaplama başarıyla buluta kaydedildi!");
      fetchHistory(); // Listeyi güncelle
    } catch (e) {
      console.error("Hata: ", e);
      alert("Kaydedilirken bir hata oluştu.");
    }
    setLoading(false);
  };

  // Geçmişi Getirme
  const fetchHistory = async () => {
    const q = query(collection(db, "hesaplamalar"), orderBy("tarih", "desc"));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setHistory(data);
  };

  // Excel Çıktısı
  const exportToExcel = () => {
    const wsData = [
      ["MARKELLA GÜMRÜK - HESAPLAMA RAPORU"],
      ["Tarih", new Date().toLocaleDateString('tr-TR')],
      [""],
      ["KALEM", "TUTAR"],
      ["Eşya Bedeli", inputs.esyaBedeli],
      ["CIF Bedel", calculations.cifBedel.toFixed(2)],
      ["Toplam Vergi", calculations.toplamVergi.toFixed(2)],
      ["GENEL MALİYET", calculations.maliyet.toFixed(2)]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hesaplama");
    XLSX.writeFile(wb, "Markella_Rapor.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Yan Menü */}
      <nav className="w-20 bg-indigo-900 flex flex-col items-center py-8 gap-6 text-white shrink-0">
        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-900 font-bold text-xl">M</div>
        <button onClick={() => setActiveTab('hesaplama')} className={`p-3 rounded-xl ${activeTab === 'hesaplama' ? 'bg-indigo-600' : ''}`}><Calculator /></button>
        <button onClick={() => {setActiveTab('arsiv'); fetchHistory();}} className={`p-3 rounded-xl ${activeTab === 'arsiv' ? 'bg-indigo-600' : ''}`}><Database /></button>
      </nav>

      <main className="flex-1 p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">MARKELLA GÜMRÜK SİSTEMİ</h1>
          <p className="text-slate-500">Profesyonel Hesaplama ve Veri Kayıt Paneli</p>
        </header>

        {activeTab === 'hesaplama' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Eşya Bedeli (FOB)</label>
                  <input name="esyaBedeli" type="number" onChange={handleInputChange} className="w-full p-3 bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Navlun</label>
                  <input name="navlun" type="number" onChange={handleInputChange} className="w-full p-3 bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Sigorta</label>
                  <input name="sigorta" type="number" onChange={handleInputChange} className="w-full p-3 bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Gümrük Vergisi (%)</label>
                  <input name="gumrukVergiOrani" type="number" value={inputs.gumrukVergiOrani} onChange={handleInputChange} className="w-full p-3 bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="bg-indigo-900 text-white p-8 rounded-2xl shadow-xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><CheckCircle2 className="text-emerald-400" /> Özet Sonuç</h2>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-indigo-800 pb-2"><span>Toplam Vergi:</span><span>{calculations.toplamVergi.toFixed(2)} ₺</span></div>
                <div className="pt-4">
                  <p className="text-sm text-indigo-400 font-bold uppercase">Genel Maliyet</p>
                  <p className="text-4xl font-black">{calculations.maliyet.toFixed(2)} ₺</p>
                </div>
                <button onClick={saveToFirebase} disabled={loading} className="w-full mt-4 bg-white text-indigo-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all">
                  <Save size={18} /> {loading ? 'Kaydediliyor...' : 'BULUTA KAYDET'}
                </button>
                <button onClick={exportToExcel} className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all">
                  <Download size={18} /> EXCEL AL
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-xl font-bold mb-4">Kayıtlı Hesaplamalar</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="p-3">Tarih</th>
                    <th className="p-3">Eşya Bedeli</th>
                    <th className="p-3">Maliyet</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(item => (
                    <tr key={item.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 text-sm">{new Date(item.tarih).toLocaleDateString()}</td>
                      <td className="p-3 font-mono">{item.esyaBedeli} ₺</td>
                      <td className="p-3 font-bold">{item.maliyet?.toFixed(2)} ₺</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
