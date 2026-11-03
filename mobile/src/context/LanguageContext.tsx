/**
 * LanguageContext — Global language state shared across all screens, saved on the device.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LANGUAGE_KEY = "agrivoice_language";

export type LanguageCode = "fil" | "ceb" | "ilo" | "en";

export const LANGUAGES = [
  { code: "fil" as LanguageCode, label: "Filipino (Tagalog)", flag: "🇵🇭" },
  { code: "ceb" as LanguageCode, label: "Cebuano",            flag: "🌺" },
  { code: "ilo" as LanguageCode, label: "Ilocano",            flag: "🌾" },
  { code: "en"  as LanguageCode, label: "English",            flag: "🇬🇧" },
];

function isLanguageCode(value: string | null): value is LanguageCode {
  return LANGUAGES.some((lang) => lang.code === value);
}

type LanguageContextType = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "fil",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("fil");
  // A choice made before the saved value finishes loading must not be overwritten by it
  const changedByUser = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((saved) => {
        if (!changedByUser.current && isLanguageCode(saved)) setLanguageState(saved);
      })
      .catch((err) => console.warn("Could not load saved language", err));
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    changedByUser.current = true;
    setLanguageState(lang);
    AsyncStorage.setItem(LANGUAGE_KEY, lang).catch((err) => console.warn("Could not save language", err));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
