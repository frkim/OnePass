import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';

// EN/FR/ES/DE at launch (Phase 6 SaaS roll-out). Adding another
// language is as simple as dropping a new JSON file here, importing it,
// and extending `resources` + `supportedLngs`.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es', 'de'],
    interpolation: { escapeValue: false },
  });

export default i18n;

export function formatDate(date: Date | string, lng: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(lng, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
