# 🛫 Markella Travel - Gümrük Check-In Kontrolü

Offline-first, multi-list, Firebase-synced tour passenger check-in system.

## ✨ Özellikler

- ✅ **Çoklu Liste Sistemi** — Markella, Atlas, Zeynep Hanım gibi farklı listeler
- ✅ **Offline Çalışma** — İnternet olmadan da her şey çalışır
- ✅ **Firebase Sync** — İnternet gelince otomatik senkronize olur
- ✅ **localStorage** — Veri kaybı asla olmaz
- ✅ **Liste Filtreleme** — "Markella" veya "Atlas" listesini ayrı göster
- ✅ **Kapı Vizesi** — Geç çıkabilecek yolcuları işaretle
- ✅ **WhatsApp Entegrasyonu** — Direkt WhatsApp'tan ara
- ✅ **Excel Import** — Excel dosyasından toplu yükleme
- ✅ **PWA** — Telefonuna kurabilirsin (uygulama gibi)

---

## 📦 Kurulum

### 1. Projeyi kur
```bash
npm install
```

### 2. Firebase ayarla
`src/App.tsx` dosyasında şu satırı bul:
```typescript
const FB = {
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
};
```

Firebase Console'dan aldığın URL ile değiştir (şu an zaten ayarlı):
```typescript
const FB = {
  databaseURL: "https://markella-rezervasyon-default-rtdb.europe-west1.firebasedatabase.app",
};
```

### 3. Çalıştır
```bash
npm run dev
```

Tarayıcıda aç: **http://localhost:3000**

---

## 🚀 Production Build

```bash
npm run build
```

`dist/` klasörü oluşur — bunu Vercel/Netlify/Firebase Hosting'e deploy et.

---

## 📱 PWA Kurulum

1. Chrome/Safari'de aç
2. Adres çubuğundaki **"Ekrana Ekle"** butonuna bas
3. Uygulama gibi kullan!

---

## 🔧 Kullanım

### Yeni Tur Başlat
1. "🆕 Yeni Tur Başlat" butonuna bas
2. Tur kodu oluşturulur (örn: TUR-A7K9)
3. Bu kodu diğer cihazlarla paylaş

### Liste Oluştur
1. "+" butonuna bas
2. **Hangi liste?** seç (Markella / Atlas / vb)
3. Excel yükle veya manuel yapıştır

### Check-In Yap
- İsme tıkla → check-in olur ✓
- Telefona tıkla → WhatsApp aç
- "+ Vize" → Kapı Vizesi ekle 🚨

### Liste Filtrele
- Üstte "Markella (16)" butonuna bas
- Sadece Markella'nın yolcularını görürsün

### Offline Kullan
- İnternet kes
- Check-in yapmaya devam et
- İnternet gelince otomatik sync olur

---

## 🛠️ Listeleri Yönet

Menü → **📑 Listeleri Yönet**
- Yeni liste ekle (örn: "Zeynep Hanım")
- Var olan listeyi sil
- Değişiklikler hemen kaydedilir

---

## 📂 Dosya Yapısı

```
├── src/
│   ├── App.tsx          # Ana uygulama
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/
│   ├── icon-192.png     # PWA icon
│   ├── icon-512.png     # PWA icon
│   ├── manifest.json    # PWA manifest
│   └── sw.js           # Service Worker
├── package.json
├── vite.config.js
└── tsconfig.json
```

---

## 🐛 Sorun Giderme

### "Tuşlar çalışmıyor" (offline)
**ÇÖZÜLDÜ** ✅ — Artık offline da her şey çalışıyor.

### "Veriler kayboldu"
**İMKANSIZ** ✅ — localStorage her şeyi kaydediyor. Tarayıcı cache'ini temizlemediğin sürece veri kaybolmaz.

### "Firebase sync olmuyor"
- İnternet bağlantını kontrol et
- Firebase URL'i doğru mu kontrol et
- 10 saniye bekle (otomatik retry var)

---

## 🎨 Özelleştirme

### Logo Değiştir
`App.tsx` içinde:
```typescript
const LOGO = "https://your-logo-url.com/logo.png";
```

### Renk Teması
`S` object'indeki renkleri değiştir (gradients, borders, vb)

---

## 📄 Lisans

MIT

---

## 👨‍💻 Destek

Sorularınız için: Anthropic Claude 🤖
