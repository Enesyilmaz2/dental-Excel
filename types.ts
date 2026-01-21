
export interface DentalRecord {
  id: string;
  name: string;
  address: string;
  phone: string;
  city: string;
  district: string;
  type: 'Diş Hekimi' | 'Diş Hastanesi' | 'Dental Klinik';
  sourceUrl: string;
}

export interface SearchProgress {
  currentCity: string;
  currentDistrict: string;
  currentType: string;
  totalFound: number;
}
