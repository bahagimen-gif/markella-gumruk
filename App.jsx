import React, { useState } from 'react';
import { Package, PlusCircle, FileDown, ClipboardList } from 'lucide-react';
import * as XLSX from 'xlsx';

function App() {
  const [passengers, setPassengers] = useState([]);
  const [currentPassenger, setCurrentPassenger] = useState({
    name: '',
    surname: '',
    passport: '',
    customsItems: []
  });
  const [item, setItem] = useState({ description: '', quantity: '', value: '' });

  const addPassenger = () => {
    if (currentPassenger.name && currentPassenger.passport) {
      setPassengers([...passengers, { ...currentPassenger, id: Date.now() }]);
      setCurrentPassenger({ name: '', surname: '', passport: '', customsItems: [] });
    }
  };

  const addItem = () => {
    if (item.description && item.quantity) {
      setCurrentPassenger({
        ...currentPassenger,
        customsItems: [...currentPassenger.customsItems, { ...item, id: Date.now() }]
      });
      setItem({ description: '', quantity: '', value: '' });
    }
  };

  const exportToExcel = () => {
    const data = passengers.flatMap(p => 
      p.customsItems.map(i => ({
        'Ad Soyad': `${p.name} ${p.surname}`,
        'Pasaport': p.passport,
        'Eşya Tanımı': i.description,
        'Adet': i.quantity,
        'Değer': i.value
      }))
    );
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gümrük Kayıtları");
    XLSX.writeFile(wb, "Markella_Gumruk_Liste.xlsx");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-8 border-b pb-4">
          <Package className="text-blue-600" size={32} />
          <h1 className="text-2xl font-bold text-gray-800">Markella Gümrük Kayıt Sistemi</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><ClipboardList size={20}/> Yolcu Bilgileri</h2>
            <input type="text" placeholder="Ad" className="w-full p-2 border rounded" value={currentPassenger.name} onChange={e => setCurrentPassenger({...currentPassenger, name: e.target.value})} />
            <input type="text" placeholder="Soyad" className="w-full p-2 border rounded" value={currentPassenger.surname} onChange={e => setCurrentPassenger({...currentPassenger, surname: e.target.value})} />
            <input type="text" placeholder="Pasaport No" className="w-full p-2 border rounded" value={currentPassenger.passport} onChange={e => setCurrentPassenger({...currentPassenger, passport: e.target.value})} />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><PlusCircle size={20}/> Eşya Ekle</h2>
            <input type="text" placeholder="Eşya Tanımı" className="w-full p-2 border rounded" value={item.description} onChange={e => setItem({...item, description: e.target.value})} />
            <div className="flex gap-2">
              <input type="number" placeholder="Adet" className="w-1/2 p-2 border rounded" value={item.quantity} onChange={e => setItem({...item, quantity: e.target.value})} />
              <button onClick={addItem} className="w-1/2 bg-green-600 text-white rounded hover:bg-green-700 transition">Eşyayı Ekle</button>
            </div>
            <div className="text-sm text-gray-500">
              Eklenen Eşyalar: {currentPassenger.customsItems.length}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button onClick={addPassenger} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700">
            <PlusCircle size={20} /> Yolcuyu Listeye Kaydet
          </button>
          <button onClick={exportToExcel} className="flex-1 bg-green-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-800">
            <FileDown size={20} /> Excel Olarak İndir
          </button>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Kayıtlı Yolcular ({passengers.length})</h2>
          <div className="border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-sm font-semibold">Yolcu</th>
                  <th className="p-3 text-sm font-semibold">Pasaport</th>
                  <th className="p-3 text-sm font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody>
                {passengers.length === 0 ? (
                  <tr><td colSpan="3" className="p-4 text-center text-gray-500">Henüz kayıt yok</td></tr>
                ) : (
                  passengers.map(p => (
                    <tr key={p.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">{p.name} {p.surname}</td>
                      <td className="p-3">{p.passport}</td>
                      <td className="p-3 text-sm text-blue-600 font-medium">{p.customsItems.length} parça eşya</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
