/**
 * LanguageContext — Global language state shared across all screens.
 */
import React, { createContext, useContext, useState } from "react";

export type LanguageCode = "fil" | "ceb" | "ilo" | "en";

export const LANGUAGES = [
  { code: "fil" as LanguageCode, label: "Filipino (Tagalog)", flag: "🇵🇭" },
  { code: "ceb" as LanguageCode, label: "Cebuano",            flag: "🌺" },
  { code: "ilo" as LanguageCode, label: "Ilocano",            flag: "🌾" },
  { code: "en"  as LanguageCode, label: "English",            flag: "🇬🇧" },
];

type LanguageContextType = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "fil",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>("fil");
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
