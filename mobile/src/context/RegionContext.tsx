/**
 * RegionContext — The farmer's region, shared across screens and saved on the device.
 * `value` is the exact UN-WFP spelling stored in market_prices and sent to the backend;
 * `label` is for display only.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REGION_KEY = "agrivoice_region";

export const REGIONS = [
  { value: "National Capital region",              label: "NCR — National Capital Region" },
  { value: "Cordillera Administrative region",     label: "CAR — Cordillera Administrative Region" },
  { value: "Region I",                             label: "Region I — Ilocos Region" },
  { value: "Region II",                            label: "Region II — Cagayan Valley" },
  { value: "Region III",                           label: "Region III — Central Luzon" },
  { value: "Region IV-A",                          label: "Region IV-A — CALABARZON" },
  { value: "Region IV-B",                          label: "Region IV-B — MIMAROPA" },
  { value: "Region V",                             label: "Region V — Bicol Region" },
  { value: "Region VI",                            label: "Region VI — Western Visayas" },
  { value: "Region VII",                           label: "Region VII — Central Visayas" },
  { value: "Region VIII",                          label: "Region VIII — Eastern Visayas" },
  { value: "Region IX",                            label: "Region IX — Zamboanga Peninsula" },
  { value: "Region X",                             label: "Region X — Northern Mindanao" },
  { value: "Region XI",                            label: "Region XI — Davao Region" },
  { value: "Region XII",                           label: "Region XII — SOCCSKSARGEN" },
  { value: "Region XIII",                          label: "Region XIII — Caraga" },
  { value: "Autonomous region in Muslim Mindanao", label: "BARMM — Autonomous Region in Muslim Mindanao" },
];

const DEFAULT_REGION = "National Capital region";

export function getRegionLabel(value: string): string {
  return REGIONS.find((r) => r.value === value)?.label ?? value;
}

type RegionContextType = {
  region: string;
  setRegion: (region: string) => void;
};

const RegionContext = createContext<RegionContextType>({
  region: DEFAULT_REGION,
  setRegion: () => {},
});

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegionState] = useState<string>(DEFAULT_REGION);
  // A choice made before the saved value finishes loading must not be overwritten by it
  const changedByUser = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(REGION_KEY)
      .then((saved) => {
        if (!changedByUser.current && saved && REGIONS.some((r) => r.value === saved)) {
          setRegionState(saved);
        }
      })
      .catch((err) => console.warn("Could not load saved region", err));
  }, []);

  const setRegion = (value: string) => {
    if (!REGIONS.some((r) => r.value === value)) return;
    changedByUser.current = true;
    setRegionState(value);
    AsyncStorage.setItem(REGION_KEY, value).catch((err) => console.warn("Could not save region", err));
  };

  return (
    <RegionContext.Provider value={{ region, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
}

export const useRegion = () => useContext(RegionContext);
