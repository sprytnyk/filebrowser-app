import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';

/**
 * Strings and keys come from FileBrowser Quantum's frontend/src/i18n/en.json, so more
 * upstream locales can be dropped in later. App-only strings live under `mobile`.
 * Upstream uses vue-i18n style `{name}` placeholders, and many labels carry optional
 * `{prefix}`/`{suffix}` slots that should render empty when not passed.
 */
const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
  missingInterpolationHandler: () => '',
  returnNull: false,
});

export default i18n;
