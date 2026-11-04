// Comprehensive translation system for all UI labels
import { getSettings } from './settings.js';

export const LABELS = {
  en: {
    // Navigation - Main
    dashboard: 'Dashboard',
    newSale: 'New Sale',
    sales: 'Sales',
    purchases: 'Purchases',
    returns: 'Returns',

    // Navigation - Inventory
    products: 'Products',
    stock: 'Stock',
    expiry: 'Expiry & batches',

    // Navigation - Parties
    customers: 'Customers',
    suppliers: 'Suppliers',
    whatsapp: 'WhatsApp',

    // Navigation - Accounts
    cashBook: 'Cash Book & Payments',
    accounts: 'Accounts',
    reports: 'Reports',

    // Navigation - Administration
    backup: 'Backup & Restore',
    settings: 'Settings',

    // Quick Actions
    expenses: 'Expenses',
    bills: 'Bills',
    purchase: 'Purchase',

    // Dashboard sections
    todaySales: "Today's sales",
    today: 'Today',
    overall: 'Overall',

    // Dashboard cards
    sales_label: 'Sales',
    purchases_label: 'Purchases',
    cashReceived: 'Cash received',
    cashPaid: 'Cash paid',
    transactions: 'Transactions',
    receivables: 'Receivables',
    payables: 'Payables',
    stockValue: 'Stock value',
    lowStockItems: 'Low stock items',
    overdueCredit: 'Overdue credit',
    expiredBatches: 'Expired batches',
    expiringDays: 'Expiring ≤ 60 days',

    // Dialog/Alert text
    noOverdueCredit: 'No overdue credit',
    noExpiryAlerts: 'No expiry alerts',
    stockHealthy: 'Stock healthy',
    noBackup: 'No backup has been made on this device yet',
    recentSales: 'Recent sales',
    expiringTip: 'sold first automatically',
    returns: 'Returns',
    days: 'days',

    // Common buttons & actions
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    import: 'Import',
    print: 'Print',
    logout: 'Log out',
    settings: 'Settings',
    help: 'Help',
    close: 'Close',
    confirm: 'Confirm',
    ok: 'OK',

    // Status & Messages
    online: 'Online',
    offline: 'Offline',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    info: 'Information',

    // Dashboard greetings
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    todaysSales: "Today's sales",
    bills: 'Bill(s)',
    cashIn: 'cash in',
    overdue: 'overdue',
    noOverdueCredit: 'No overdue credit',
    expired: 'expired',
    expiringSoon: 'expiring soon',
    noExpiryAlerts: 'No expiry alerts',
    lowStock: 'low stock',
    stockHealthy: 'Stock healthy',
    youAreOffline: 'You are offline. Everything you do is saved on this device.',
    noBackupMade: 'No backup has been made on this device yet.',
    lastBackupWas: 'Last backup was',
    daysAgo: 'days ago.',
    yourDataOnly: 'Your data only lives on this device.',
    backUp: 'Back up',
    batchesExpiredWarning: 'batch(es) in stock have expired. They are blocked from sale — return them to the supplier or write them off.',
    review: 'Review',
    recentSales: 'Recent sales',
    expiringSoonLabel: 'Expiring soon',
    soldFirstAutomatically: 'sold first automatically',
    lowStockLabel: 'Low stock',
    noSalesYet: 'No sales yet today',
    nothingExpires: 'Nothing expires within',
    allStockLevels: 'All stock levels are fine',
    batch: 'Batch',
    min: 'Min',

    // Login page
    welcomeBack: 'Welcome back',
    signInToOpen: 'Sign in to open your shop',
    username: 'Username',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    internetRequired: 'Internet is required to sign in. After that, the POS works offline.',
    batches: 'Batches & expiry',
    sellOldest: 'Sell oldest first',
    farmerCredit: 'Farmer credit',
    whatsappMsg: 'WhatsApp',
    offline: 'Offline — connect to the internet to sign in',
  },
  ur: {
    // Navigation - Main
    dashboard: 'ڈیش بورڈ',
    newSale: 'نیا فروخت',
    sales: 'فروخت',
    purchases: 'خریداری',
    returns: 'واپسی',

    // Navigation - Inventory
    products: 'پروڈکٹس',
    stock: 'اسٹاک',
    expiry: 'میعاد اور بیچ',

    // Navigation - Parties
    customers: 'کسٹمرز',
    suppliers: 'سپلائرز',
    whatsapp: 'واٹس ایپ',

    // Navigation - Accounts
    cashBook: 'نقد بہی اور ادائیگیاں',
    accounts: 'حسابات',
    reports: 'رپورٹیں',

    // Navigation - Administration
    backup: 'بیک اپ اور بحال کریں',
    settings: 'سیٹنگز',

    // Quick Actions
    expenses: 'اخراجات',
    bills: 'بل',
    purchase: 'خریداری',

    // Dashboard sections
    todaySales: 'آج کی فروخت',
    today: 'آج',
    overall: 'مجموعی',

    // Dashboard cards
    sales_label: 'فروخت',
    purchases_label: 'خریداری',
    cashReceived: 'نقد وصول',
    cashPaid: 'نقد ادا',
    transactions: 'ٹرانزیکشنز',
    receivables: 'وصول یافتہ',
    payables: 'ادا یافتہ',
    stockValue: 'اسٹاک کی قیمت',
    lowStockItems: 'کم اسٹاک کی چیزیں',
    overdueCredit: 'شدہ کریڈٹ',
    expiredBatches: 'میعاد ختم بیچ',
    expiringDays: 'میعاد ≤ 60 دن',

    // Dialog/Alert text
    noOverdueCredit: 'کوئی شدہ کریڈٹ نہیں',
    noExpiryAlerts: 'کوئی میعاد الرٹ نہیں',
    stockHealthy: 'اسٹاک صحت مند',
    noBackup: 'اس ڈیوائس پر ابھی کوئی بیک اپ نہیں بنایا گیا',
    recentSales: 'حالیہ فروخت',
    expiringTip: 'پہلے خودکار طور پر فروخت',
    returns: 'واپسی',
    days: 'دن',

    // Common buttons & actions
    save: 'محفوظ کریں',
    cancel: 'منسوخ کریں',
    delete: 'حذف کریں',
    edit: 'ترمیم کریں',
    add: 'شامل کریں',
    search: 'تلاش کریں',
    filter: 'فلٹر کریں',
    export: 'برآمد کریں',
    import: 'درآمد کریں',
    print: 'پرنٹ کریں',
    logout: 'لاگ آؤٹ کریں',
    settings: 'سیٹنگز',
    help: 'مدد',
    close: 'بند کریں',
    confirm: 'تصدیق کریں',
    ok: 'ٹھیک ہے',

    // Status & Messages
    online: 'آن لائن',
    offline: 'آف لائن',
    loading: 'لوڈ ہو رہا ہے...',
    error: 'خرابی',
    success: 'کامیاب',
    warning: 'انتباہ',
    info: 'معلومات',

    // Dashboard greetings
    goodMorning: 'صبح بخیر',
    goodAfternoon: 'دوپہر بخیر',
    goodEvening: 'شام بخیر',
    todaysSales: 'آج کی فروخت',
    bills: 'بل',
    cashIn: 'نقد وصول',
    overdue: 'شدہ',
    noOverdueCredit: 'کوئی شدہ کریڈٹ نہیں',
    expired: 'میعاد ختم',
    expiringSoon: 'جلد ختم ہونے والا',
    noExpiryAlerts: 'کوئی میعاد الرٹ نہیں',
    lowStock: 'کم اسٹاک',
    stockHealthy: 'اسٹاک صحت مند',
    youAreOffline: 'آپ آف لائن ہیں۔ آپ جو کچھ بھی کرتے ہیں اس ڈیوائس پر محفوظ ہے۔',
    noBackupMade: 'اس ڈیوائس پر ابھی کوئی بیک اپ نہیں بنایا گیا۔',
    lastBackupWas: 'آخری بیک اپ',
    daysAgo: 'دن پہلے تھا۔',
    yourDataOnly: 'آپ کا ڈیٹا صرف اس ڈیوائس پر ہے۔',
    backUp: 'بیک اپ کریں',
    batchesExpiredWarning: 'بیچز اسٹاک میں میعاد ختم ہو گئے ہیں۔ وہ فروخت سے روک دیے گئے ہیں — انہیں سپلائر کو واپس کریں یا لکھ دیں۔',
    review: 'دیکھیں',
    recentSales: 'حالیہ فروخت',
    expiringSoonLabel: 'جلد ختم ہونے والا',
    soldFirstAutomatically: 'خود بخود پہلے فروخت',
    lowStockLabel: 'کم اسٹاک',
    noSalesYet: 'ابھی آج کوئی فروخت نہیں',
    nothingExpires: 'کچھ نہیں ختم ہوتا',
    allStockLevels: 'تمام اسٹاک لیولز ٹھیک ہیں',
    batch: 'بیچ',
    min: 'کم از کم',

    // Login page
    welcomeBack: 'خوش آمدید',
    signInToOpen: 'اپنی دکان کھولنے کے لیے سائن ان کریں',
    username: 'یوزر نیم',
    password: 'پاس ورڈ',
    signIn: 'سائن ان کریں',
    signingIn: 'سائن ان ہو رہے ہیں…',
    internetRequired: 'سائن ان کرنے کے لیے انٹرنیٹ درکار ہے۔ اس کے بعد، یہ ایپ آف لائن کام کرتی ہے۔',
    batches: 'بیچ اور میعاد',
    sellOldest: 'سب سے پرانا پہلے بیچیں',
    farmerCredit: 'کسان کریڈٹ',
    whatsappMsg: 'واٹس ایپ',
    offline: 'آف لائن — سائن ان کرنے کے لیے انٹرنیٹ سے جڑیں',
  },
};

export function t(key) {
  const lang = getSettings().language || 'en';
  return LABELS[lang]?.[key] || LABELS.en[key] || key;
}
