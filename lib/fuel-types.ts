export type FuelEntry = {
  id: string;
  sourceNotionId: string | null;
  fillDate: string | null;
  unitPrice: number | null;
  amount: number | null;
  liters: number | null;
  odometer: number | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  note: string | null;
};

export type Tab = "fills" | "analytics" | "map";
export type Theme = "light" | "dark";
export type FormMode = "new" | "edit";
export type MonthlyMetric = {
  month: string;
  amount: number;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  fillCount: number;
  liters: number;
};
export type ConsumptionEstimate = {
  litersPer100Km: number;
  eurosPer100Km: number;
  intervalCount: number;
};

export type JournalChange = { entry: FuelEntry } | { deletedId: string };
