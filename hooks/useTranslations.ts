
import { useCallback } from 'react';
import { translations } from '../translations';

export const useTranslations = (lang: keyof typeof translations = 'en') => {
  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: any = translations[lang] || translations.en;
    for (const k of keys) {
      result = result?.[k];
      if (result === undefined) {
        let fallbackResult: any = translations.en;
        for (const fk of keys) { fallbackResult = fallbackResult?.[fk]; }
        result = fallbackResult || key;
        break;
      }
    }
    let template = typeof result === 'string' ? result : key;
    if (params) {
      Object.keys(params).forEach(paramKey => {
        const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
        template = template.replace(regex, params[paramKey]);
      });
    }
    return template;
  }, [lang]);
  return { t, lang };
};
