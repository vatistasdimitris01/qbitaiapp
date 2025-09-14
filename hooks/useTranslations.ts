import { useState, useCallback } from 'react';
import { translations } from '../translations';

type Language = keyof typeof translations;

export const useTranslations = (initialLang: Language = 'en') => {
  const [lang, setLang] = useState<Language>(initialLang);

  const t = useCallback((key: string): string => {
    const keys = key.split('.');
    let result: any = translations[lang] || translations.en;
    for (const k of keys) {
      result = result?.[k];
      if (result === undefined) {
        // Fallback to English if key not found in current language
        let fallbackResult: any = translations.en;
        for (const fk of keys) {
            fallbackResult = fallbackResult?.[fk];
        }
        return fallbackResult || key;
      }
    }
    return result || key;
  }, [lang]);

  return { t, setLang, lang };
};
