
import { GoogleGenAI } from "@google/genai";
import { DentalRecord } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const fetchDentalData = async (
  city: string,
  district: string,
  type: string,
  location?: { lat: number; lng: number }
): Promise<DentalRecord[]> => {
  // Telefon ve Adres bilgilerini kesinlikle ayrı ayrı vermesi için promptu optimize ettik.
  const prompt = `${city} şehri ${district} bölgesindeki "${type}" işletmelerini listele. 
  Lütfen her işletme için şu bilgileri eksiksiz sağla:
  1. İşletme Tam Adı
  2. Varsa Sabit Telefon ve Cep Telefonu (Aralarına virgül koyarak listele)
  3. Tam Açık Adres
  
  ÖNEMLİ: Gerçek ve doğrulanmış verileri getir.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: location ? {
            latLng: {
              latitude: location.lat,
              longitude: location.lng
            }
          } : undefined
        }
      },
    });

    const text = response.text || "";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const records: DentalRecord[] = [];
    
    // Metin içerisinden telefon numaralarını ayıklamak için regex (opsiyonel destek)
    const phoneRegex = /(?:\+90|0)?\s?[2-5][0-9]{2}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}/g;
    
    groundingChunks.forEach((chunk: any, index: number) => {
      if (chunk.maps) {
        // Gemini metin yanıtından telefonları bulmaya çalışıyoruz
        const foundPhones = text.match(phoneRegex) || [];
        const uniquePhones = Array.from(new Set(foundPhones)).slice(0, 2); // En fazla 2 telefon al

        records.push({
          id: `rec-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          name: chunk.maps.title || "Bilinmeyen İşletme",
          address: chunk.maps.address || `${city} ${district}`, 
          phone: uniquePhones.join(", ") || "Bilgi için harita linkine bakınız",
          city: city,
          district: district,
          type: type as any,
          sourceUrl: chunk.maps.uri || "#"
        });
      }
    });

    return records;
  } catch (error: any) {
    if (error.message?.includes("quota")) {
      throw new Error("API Kotası doldu. Lütfen 1 dakika bekleyip devam ediniz.");
    }
    console.error("Gemini API Error:", error);
    return [];
  }
};
