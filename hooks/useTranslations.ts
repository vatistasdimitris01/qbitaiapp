import { useState, useCallback } from 'react';
import { translations } from '../translations';

type Language = keyof typeof translations;

export const useTranslations = (initialLang: Language = 'en') => {
  const [lang, setLang] = useState<Language>(initialLang);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: any = translations[lang] || translations.en;

    // Traverse the keys to find the translation string
    for (const k of keys) {
      result = result?.[k];
      if (result === undefined) {
        // Fallback to English if key not found
        let fallbackResult: any = translations.en;
        for (const fk of keys) {
          fallbackResult = fallbackResult?.[fk];
        }
        result = fallbackResult || key; // Use the key itself if no fallback found
        break; // Exit loop once fallback is determined
      }
    }

    let template = typeof result === 'string' ? result : key;

    // Replace placeholders like {name} with values from params
    if (params) {
      Object.keys(params).forEach(paramKey => {
        const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
        template = template.replace(regex, params[paramKey]);
      });
    }

    return template;
  }, [lang]);

  return { t, setLang, lang };
};
