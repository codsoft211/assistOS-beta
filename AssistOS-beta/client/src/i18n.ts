import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonPt from './locales/pt/common.json';
import comprasPt from './locales/pt/compras.json';
import financeiroPt from './locales/pt/financeiro.json';

import commonEn from './locales/en/common.json';
import comprasEn from './locales/en/compras.json';
import financeiroEn from './locales/en/financeiro.json';

const resources = {
  pt: {
    common: commonPt,
    compras: comprasPt,
    financeiro: financeiroPt,
  },
  en: {
    common: commonEn,
    compras: comprasEn,
    financeiro: financeiroEn,
  },
};

// Safe localStorage access with runtime check for SSR/test compatibility
const getStoredLanguage = (): string => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('assistos-language') || 'pt';
  }
  return 'pt';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: 'pt',
    defaultNS: 'common',
    ns: ['common', 'compras', 'financeiro'],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
