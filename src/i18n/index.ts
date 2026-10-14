import { getLocales, type Locale, useLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { useEffect } from 'react';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import uk from './uk.json';

/**
 * Keys come from FileBrowser Quantum's frontend/src/i18n/en.json, so more upstream locales can
 * be dropped in later. App-only strings live under `mobile`. Upstream uses vue-i18n style
 * `{name}` placeholders, and many labels carry optional `{prefix}`/`{suffix}` slots that should
 * render empty when not passed.
 *
 * uk.json is our own translation: upstream's ua.json is machine-translated and gets common
 * labels wrong ("Move" as "Відійди."). Keys missing from it fall back to English.
 */
const resources = { en: { translation: en }, uk: { translation: uk } };
type Language = keyof typeof resources;

function isLanguage(code: string | null): code is Language {
  return code !== null && code in resources;
}

/** The first of the user's languages that the app has, else English. */
function pick(locales: Locale[]): { language: Language; tag: string } {
  const match = locales.find((l) => isLanguage(l.languageCode));
  return match && isLanguage(match.languageCode)
    ? { language: match.languageCode, tag: match.languageTag }
    : { language: 'en', tag: 'en' };
}

let current = pick(getLocales());

/** Locale for dates and numbers, matching the language the app is shown in (e.g. "uk-UA"). */
export function formatLocale(): string {
  return current.tag;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: current.language,
  fallbackLng: 'en',
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
  missingInterpolationHandler: () => '',
  returnNull: false,
});

/**
 * Follows changes to the system (or per-app) language while the app runs. Android keeps the
 * app alive across a language change, so this has to happen at runtime.
 */
export function useLanguageSync() {
  const locales = useLocales();
  useEffect(() => {
    current = pick(locales);
    if (i18n.language !== current.language) void i18n.changeLanguage(current.language);
  }, [locales]);
}

export default i18n;
