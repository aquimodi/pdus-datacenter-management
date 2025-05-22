import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from './locales/es.json';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import pt from './locales/pt.json';
import de from './locales/de.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      'pt-BR': { translation: ptBR },
      pt: { translation: pt },
      de: { translation: de }
    },
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;