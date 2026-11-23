/**
 * Read-aloud for answers (expo-speech, the phone's own text-to-speech; works offline if the voice is installed).
 * Only the spoken form changes: the text on screen stays exactly as the AI wrote it.
 */
import * as Speech from "expo-speech";
import { setAudioModeAsync } from "expo-audio";
import type { LanguageCode } from "../context/LanguageContext";

// shortcut: phones have no Cebuano or Ilocano voice, so those are read with the Filipino voice; revisit if one appears.
const VOICE_LANGUAGE: Record<LanguageCode, string> = { fil: "fil-PH", ceb: "fil-PH", ilo: "fil-PH", en: "en-US" };

// Asking for "fil-PH" by language alone lets Android fall back to its default (American English)
// voice when no Filipino voice is downloaded, so the installed Filipino voice is picked explicitly.
let filipinoVoice: Promise<string | null> | null = null;
function findFilipinoVoice(): Promise<string | null> {
  filipinoVoice ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const tagalog = voices.filter((v) => /^(fil|tl)([-_]|$)/i.test(v.language));
      // Prefer an offline / higher-quality voice when several exist
      tagalog.sort((a, b) => Number(b.quality === "Enhanced") - Number(a.quality === "Enhanced"));
      return tagalog[0]?.identifier ?? null;
    })
    .catch(() => null);
  return filipinoVoice;
}

/** False when the phone has no Filipino voice, so Filipino/Cebuano/Ilocano answers would sound American. */
export async function hasFilipinoVoice(): Promise<boolean> {
  return (await findFilipinoVoice()) !== null;
}

/** The answer as it should sound: no bullet marks, and "₱60/kg" read as "60 piso kada kilo". */
export function toSpeech(text: string, language: LanguageCode): string {
  const en = language === "en";
  return text
    .replace(/^\s*•\s?/gm, "")
    .replace(/₱\s?(\d[\d,]*(?:\.\d+)?)/g, (_, amount: string) => `${amount} ${en ? "pesos" : "piso"}`)
    .replace(/\s?\/\s?kg\b/gi, en ? " per kilo" : " kada kilo");
}

/**
 * Reads text aloud, replacing anything already playing. onEnd runs when it finishes, is stopped or fails.
 * stillWanted is checked after the audio switch, so a reading cancelled meanwhile (e.g. the mic was tapped) never starts.
 */
export async function speak(text: string, language: LanguageCode, onEnd: () => void, stillWanted: () => boolean): Promise<void> {
  Speech.stop();
  // After a recording, iOS keeps audio on the quiet earpiece until recording mode is switched off
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    .catch((err) => console.warn("Could not switch audio to the speaker", err));
  const voice = language === "en" ? undefined : (await findFilipinoVoice()) ?? undefined;
  if (!stillWanted()) return;
  Speech.speak(toSpeech(text, language), {
    language: VOICE_LANGUAGE[language],
    voice,
    rate: 0.9,   // a little slower than default, for clarity outdoors
    onDone: onEnd,
    onStopped: onEnd,
    onError: onEnd,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
