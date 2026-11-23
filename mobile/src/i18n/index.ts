/**
 * useT() — translated UI text for the selected language.
 *
 *   const t = useT();
 *   t("voice.regionLine", { region: "NCR" })
 *
 * Screens that call useT() re-render when the language changes, so visible text
 * (including errors stored as keys) switches immediately.
 */
import { useCallback } from "react";
import { useLanguage, type LanguageCode } from "../context/LanguageContext";
import { classifyApiError, type ApiErrorKind } from "../services/api";
import { DICTIONARIES, type Dictionary, type StringKey } from "./strings";

export type { StringKey } from "./strings";
export type TranslateValues = Record<string, string | number>;
export type Translate = (key: StringKey, values?: TranslateValues) => string;

// Cebuano and Ilocano keep the original bilingual wording until native-reviewed dictionaries exist
const DICTIONARY_FOR: Record<LanguageCode, Dictionary> = {
  en: DICTIONARIES.en,
  fil: DICTIONARIES.fil,
  ceb: DICTIONARIES.mixed,
  ilo: DICTIONARIES.mixed,
};

/** A UI message stored as a key, so it is translated when shown, not when it happened. */
export type UiMessage = { key: StringKey; values?: TranslateValues };

export const API_ERROR_KEYS: Record<ApiErrorKind, StringKey> = {
  offline: "error.offline",
  timeout: "error.timeout",
  unclear: "error.unclear",
  serviceDown: "error.serviceDown",
  server: "error.server",
  unknown: "error.unknown",
};

/** The translated-when-shown message for a failed request. Log the error itself separately. */
export function apiErrorMessage(err: unknown): UiMessage {
  const { kind, status } = classifyApiError(err);
  return { key: API_ERROR_KEYS[kind], values: status !== undefined ? { status } : undefined };
}

export function useT(): Translate {
  const { language } = useLanguage();
  const dictionary = DICTIONARY_FOR[language];
  return useCallback(
    (key, values) =>
      dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) =>
        values && name in values ? String(values[name]) : match
      ),
    [dictionary]
  );
}
