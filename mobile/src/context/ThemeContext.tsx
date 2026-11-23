/**
 * ThemeContext — Day or Night, saved on the device. Day is the default (readable in the sun).
 * Children render only after the saved choice is known, so the app never flashes the wrong theme.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyThemeMode, type ThemeMode } from "../theme";

const THEME_KEY = "agrivoice_theme";

type ThemeContextType = { mode: ThemeMode; setMode: (mode: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextType>({ mode: "day", setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .catch((err) => { console.warn("Could not load saved theme", err); return null; })
      .then((saved) => {
        const loaded: ThemeMode = saved === "night" ? "night" : "day";
        applyThemeMode(loaded);
        setModeState(loaded);
      });
  }, []);

  const setMode = (next: ThemeMode) => {
    applyThemeMode(next);
    setModeState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch((err) => console.warn("Could not save theme", err));
  };

  if (mode === null) return null;
  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export const useThemeMode = () => useContext(ThemeContext);
