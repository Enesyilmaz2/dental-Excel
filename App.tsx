
import React, { useState, useEffect, useRef } from 'react';
import { fetchDentalData } from './services/geminiService';
import { DentalRecord, SearchProgress } from './types';
import { CITIES, DENTAL_TYPES } from './constants';

const App: React.FC = () => {
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>();
  const stopRef = useRef(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.log("Konum izni reddedildi.")
      );
    }
    // Yerel hafızadan eski verileri yükle (varsa)
    const saved = localStorage.getItem('dental_records_backup');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error("Yedek yüklenemedi");
      }
    }
  }, []);

  // Kayıtlar değiştikçe yedekle
  useEffect(() => {
    if (records.length > 0) {
      localStorage.setItem('dental_records_backup', JSON.stringify(records));
    }
  }, [records]);

  const startScraping = async () => {
    setIsSearching(true);
    setError(null);
    stopRef.current = false;
    
    for (const city of CITIES) {
      if (stopRef.current) break;

      const lookupZones = ["Merkez", "İlçeler"]; 
      
      for (const zone of lookupZones) {
        if (stopRef.current) break;

        for (const type of DENTAL_TYPES) {
          if (stopRef.current) break;

          setProgress({
            currentCity: city,
            currentDistrict: zone,
            currentType: type,
            totalFound: records.length
          });

          let success = false;
          while (!success && !stopRef.current) {
            try {
              const newResults = await fetchDentalData(city, zone, type, userLocation);
              if (newResults.length > 0) {
                setRecords(prev => {
                  const existingNames = new Set(prev.map(p => p.name.toLowerCase()));
                  const filtered = newResults.filter(r => !existingNames.has(r.name.toLowerCase()));
                  return [...prev, ...filtered];
                });
              }
              success = true;
              setError(null);
              // Kota dostu yavaş tarama (3 saniye bekleme)
              await new Promise(r => setTimeout(r, 3000));
            } catch (err: any) {
              if (err.message?.includes("Kota")) {
                setError("Kota doldu! Otomatik olarak 60 saniye sonra devam edilecek...");
                for (let i = 60; i > 0; i--) {
                  if (stopRef.current) break;
                  setRetryCountdown(i);
                  await new Promise(r => setTimeout(r, 1000));
                }
                setRetryCountdown(null);
                setError(null);
                // Döngü başa döner ve aynı sorguyu tekrar dener
              } else {
                setError(err.message);
                setIsSearching(false);
                return;
              }
            }
          }
        }
      }
    }
    setIsSearching(false);
  };

  const stopScraping = () => {
    stopRef.current = true;
    setIsSearching(false);
    setRetryCountdown(null);
  };

  const exportToExcel = () => {
    const headers = ["İşletme Adı", "Telefon 1", "Telefon 2", "Adres", "Şehir", "İlçe/Bölge", "Kategori", "Maps Linki"].join(",") + "\n";
    
    const csvContent = records.map(r => {
      const phones = r.phone.split(",").map(p => p.trim());
      const phone1 = phones[0] || "";
      const phone2 = phones[1] || "";
      
      return [
        `"${r.name.replace(/"/g, '""')}"`,
        `"${phone1}"`,
        `"${phone2}"`,
        `"${r.address.replace(/"/g, '""')}"`,
        `"${r.city}"`,
        `"${r.district}"`,
        `"${r.type}"`,
        `"${r.sourceUrl}"`
      ].join(",");
    }).join("\n");
    
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.body.appendChild(document.createElement("a"));
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `Turkiye_Dental_Veri_${records.length}_Kayit.csv`;
    link.click();
    document.body.removeChild(link);
  };

  const clearBackup = () => {
    if (window.confirm("Tüm listeyi temizlemek istediğinize emin misiniz?")) {
      setRecords([]);
      localStorage.removeItem('dental_records_backup');
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <i className="fa-solid fa-tooth text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight">DENTAL VERİ</h1>
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">Kesintisiz Tarama Modu</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {!isSearching ? (
            <button onClick={startScraping} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700 transition-all flex items-center gap-2 text-sm shadow-lg shadow-blue-100">
              <i className="fa-solid fa-play"></i> Taramayı Başlat
            </button>
          ) : (
            <button onClick={stopScraping} className="bg-red-500 text-white px-5 py-2 rounded-lg font-bold hover:bg-red-600 transition-all flex items-center gap-2 text-sm shadow-lg shadow-red-100">
              <i className="fa-solid fa-pause"></i> Duraklat
            </button>
          )}
          
          <button onClick={exportToExcel} disabled={records.length === 0} className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 text-sm shadow-lg shadow-emerald-100">
            <i className="fa-solid fa-download mr-2"></i> Excel İndir ({records.length})
          </button>

          <button onClick={clearBackup} className="bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold hover:bg-red-100 hover:text-red-600 transition-all text-sm">
            <i className="fa-solid fa-trash"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 max-w-6xl">
        {retryCountdown !== null && (
          <div className="bg-amber-500 text-white p-6 rounded-2xl mb-6 shadow-xl animate-pulse flex items-center justify-between">
            <div className="flex items-center gap-4">
              <i className="fa-solid fa-hourglass-half text-3xl"></i>
              <div>
                <h3 className="font-black text-lg">Kota Bekleme Modu Aktif</h3>
                <p className="text-sm opacity-90 text-amber-50">API limiti aşıldı. Kotanın sıfırlanması için bekleniyor...</p>
              </div>
            </div>
            <div className="text-4xl font-black bg-amber-600/50 px-6 py-2 rounded-xl border-2 border-amber-400">
              {retryCountdown}s
            </div>
          </div>
        )}

        {isSearching && progress && retryCountdown === null && (
          <div className="bg-blue-600 text-white p-6 rounded-2xl mb-6 shadow-xl relative overflow-hidden transition-all">
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Şu anki Hedef</p>
                  <h2 className="text-3xl font-black tracking-tight">{progress.currentCity} <span className="text-blue-300">/</span> {progress.currentDistrict}</h2>
                </div>
                <div className="text-right">
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Bulunan Toplam</p>
                  <p className="text-3xl font-black">{records.length}</p>
                </div>
              </div>
              <div className="mt-6 flex gap-3 text-[10px] font-black uppercase tracking-widest">
                <span className="bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10">{progress.currentType}</span>
                <span className="bg-emerald-500/80 px-3 py-1.5 rounded-lg backdrop-blur-md border border-emerald-400/30">İnternet Taranıyor</span>
              </div>
            </div>
            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/10 to-transparent"></div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Veri Akışı</span>
            <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${isSearching ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></div>
               <span className="text-[10px] font-bold text-slate-500 uppercase">{isSearching ? 'Canlı Tarama' : 'Durduruldu'}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-6 py-5">İşletme Adı</th>
                  <th className="px-6 py-5">İletişim</th>
                  <th className="px-6 py-5">Bölge</th>
                  <th className="px-6 py-5 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.length > 0 ? (
                  records.slice().reverse().slice(0, 50).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{r.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{r.type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          {r.phone.split(',').map((p, idx) => (
                            <span key={idx} className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded inline-block w-fit">
                              <i className="fa-solid fa-phone text-[8px] mr-1 text-blue-500"></i> {p.trim()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-black text-slate-600">{r.city}</div>
                        <div className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{r.address}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a href={r.sourceUrl} target="_blank" className="w-8 h-8 rounded-full bg-slate-100 inline-flex items-center justify-center text-slate-400 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                          <i className="fa-solid fa-location-arrow text-[10px]"></i>
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-32 text-center text-slate-300">
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-magnifying-glass-location text-5xl mb-4 opacity-20"></i>
                        <p className="text-sm font-black uppercase tracking-widest opacity-40">Veri Toplanmaya Hazır</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
