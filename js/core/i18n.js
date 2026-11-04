// Simple translation system for dashboard and UI labels
import { getSettings } from './settings.js';

export const LABELS = {
  en: {
    // Dashboard quick actions
    stock: 'Stock',
    expenses: 'Expenses',
    bills: 'Bills',
    newSale: 'New sale',
    purchase: 'Purchase',
    cashBook: 'Cash book',
    customers: 'Customers',
    whatsapp: 'WhatsApp',
    reports: 'Reports',
  },
  ur: {
    // Urdu translations
    stock: 'اسٹاک',
    expenses: 'اخراجات',
    bills: 'بل',
    newSale: 'نیا فروخت',
    purchase: 'خریداری',
    cashBook: 'کیش بک',
    customers: 'کسٹمرز',
    whatsapp: 'واٹس ایپ',
    reports: 'رپورٹیں',
  },
};

export function t(key) {
  const lang = getSettings().language || 'en';
  return LABELS[lang]?.[key] || LABELS.en[key] || key;
}
