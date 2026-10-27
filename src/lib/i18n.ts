import type { Locale } from "@/lib/types";

export const locales: Locale[] = ["ar", "en"];

const copy = {
  ar: {
    navCatalog: "الكتالوج",
    navAbout: "حكايتنا",
    navWholesale: "الجملة",
    navCustom: "تصنيع خاص",
    navContact: "اتصل بنا",
    search: "ابحث في القطع",
    searchLabel: "ابحث عن قطعة",
    searchPlaceholder: "مثال: كنكة، سبرتاية، طقم قهوة",
    catalog: "كل القطع",
    categories: "التصنيفات",
    category: "تصنيف",
    browse: "تصفّح القطع",
    browseCategories: "كل التصنيفات",
    explore: "عرض التفاصيل",
    viewAll: "عرض الكل",
    featured: "من الكتالوج",
    browseEyebrow: "اختيارات من المصنع",
    preview: "كتالوج للعرض فقط",
    availabilityNote: "الأسعار والتوافر قيد المراجعة. لا يتوفر طلب أو دفع إلكتروني في هذه النسخة.",
    sourceNote: "الاسم والوصف بالعربية كما وردا في كتالوج المصنع.",
    categoryReview: "التصنيف قيد المراجعة",
    noProducts: "لا توجد قطع مطابقة لهذا البحث.",
    noQuery: "اكتب كلمة للبحث في الكتالوج.",
    resultFor: "نتائج البحث عن",
    customCta: "للتصنيع حسب الطلب، تواصل مباشرة مع المصنع.",
    callFactory: "اتصل بالمصنع",
    whatsapp: "واتساب",
    wholesaleIntro:
      "لطلبات الجملة والتصدير، يرجى التواصل هاتفياً أو عبر واتساب لمناقشة الكميات والتفاصيل.",
    customIntro:
      "طلبات التصنيع الخاص تبدأ بالتواصل المباشر مع المصنع. لا يوجد نموذج تسعير أو طلب مخصص عبر الموقع.",
    aboutLead: "مصنع سبرتاية وكنكة للنحاس، يقدّم منتجات من النحاس والصدف.",
    aboutStory:
      "بحسب ما ينشره المصنع في موقعه الحالي، بدأ نشاطه عام ١٩٩٣ في القاهرة الفاطمية ضمن الحرف اليدوية التراثية.",
    aboutSource: "المصدر: صفحة «عن المتجر» في الموقع الحالي.",
    language: "English",
    menu: "القائمة",
    footerNote: "الكتالوج قيد المراجعة قبل تفعيل الطلبات الإلكترونية.",
    backToCatalog: "العودة إلى الكتالوج",
    productDetails: "تفاصيل القطعة",
    inArabic: "المعلومات الأصلية متاحة بالعربية فقط حالياً.",
    contactForDetails: "للاستفسار عن القطعة، اتصل بالمصنع.",
    previousPage: "السابق",
    nextPage: "التالي",
    pageOf: "صفحة",
  },
  en: {
    navCatalog: "Collection",
    navAbout: "Our story",
    navWholesale: "Wholesale",
    navCustom: "Custom work",
    navContact: "Contact",
    search: "Search pieces",
    searchLabel: "Search the catalog",
    searchPlaceholder: "Search the Arabic catalog",
    catalog: "All pieces",
    categories: "Categories",
    category: "Category",
    browse: "Browse the collection",
    browseCategories: "All categories",
    explore: "View details",
    viewAll: "View all",
    featured: "From the catalog",
    browseEyebrow: "Selected from the workshop",
    preview: "Catalog preview",
    availabilityNote:
      "Prices and availability are under review. Online ordering and payment are not enabled in this release.",
    sourceNote:
      "Product names and descriptions are shown in their original Arabic from the factory catalog.",
    categoryReview: "Category assignment under review",
    noProducts: "No pieces match this search.",
    noQuery: "Enter a word to search the catalog.",
    resultFor: "Search results for",
    customCta: "For made-to-order work, contact the factory directly.",
    callFactory: "Call the factory",
    whatsapp: "WhatsApp",
    wholesaleIntro:
      "For wholesale and export enquiries, contact the factory by phone or WhatsApp to discuss quantities and details.",
    customIntro:
      "Custom manufacturing starts with a direct conversation with the factory. This website does not accept custom quote requests.",
    aboutLead: "Sprtaya & Kanaka Copper Factory presents pieces made from copper and shell.",
    aboutStory:
      "According to the factory’s current website, its work began in 1993 in historic Cairo as part of Egypt’s traditional handcrafts.",
    aboutSource: "Source: the current website’s About page.",
    language: "العربية",
    menu: "Menu",
    footerNote: "The catalog is under review before online orders are enabled.",
    backToCatalog: "Back to collection",
    productDetails: "Piece details",
    inArabic: "Original product information is currently available in Arabic only.",
    contactForDetails: "For details about this piece, call the factory.",
    previousPage: "Previous",
    nextPage: "Next",
    pageOf: "Page",
  },
} as const;

export type CopyKey = keyof (typeof copy)["ar"];

export function getCopy(locale: Locale, key: CopyKey): string {
  return copy[locale][key];
}

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

const categoryNamesEn: Record<string, string> = {
  mkahl: "Kohl holders",
  maaalk: "Spoons",
  sbrtay: "Copper burners",
  asaor: "Bracelets",
  "dlayat-slasl": "Pendants",
  accessories: "Accessories",
  cup: "Copper cups",
  alsbh: "Prayer beads",
  "hdayat-shhr-rmdan": "Ramadan gifts",
  "brad-shay": "Tea pots",
  sbayk: "Copper ingots",
  "atkm-kho": "Coffee sets",
  "zgagh-oakoab-almyah": "Bottles & tumblers",
  "sprtaya-kanaka": "Burners & coffee pots",
  "atkm-kho-oshay": "Coffee & tea sets",
  "hrm-altakh": "Energy pyramids",
  "dal-kho-aarby": "Arabic coffee pots",
  "dbl-okhoatm": "Rings",
  "mntjat-alsdf-altbyaay": "Shell pieces",
  "slasl-oansyalat-okolyhat": "Chains & bracelets",
  kanaka: "Coffee pots",
  soany: "Trays",
  "atbak-kraany-otthkary": "Engraved plates",
  hlkan: "Earrings",
  mydalyat: "Keychains",
  "adoat-almaed-otkdym-altaaam": "Dining & serving",
  "sukariat-banana": "Sugar bowls & fruit stands",
  khlkhal: "Anklets",
  "mntgat-akhr": "Other pieces",
  amshat: "Combs",
  "althf-o-alantykat": "Collectibles",
  "ksm-aljml-oaltsdyr": "Wholesale & export",
  "kolyhat-o-aakd": "Necklaces",
  mbakhr: "Incense burners",
  "atkm-shay": "Tea sets",
};

export function displayCategoryName(id: string, nameAr: string, locale: Locale, nameEn?: string | null): string {
  return locale === "en" ? (nameEn || categoryNamesEn[id] || nameAr + " · Arabic") : nameAr;
}

const shortCategoryNames: Record<string, { ar: string; en: string }> = {
  "sprtaya-kanaka": { ar: "السبرتايات", en: "Burners" },
  "atkm-kho": { ar: "أطقم القهوة", en: "Coffee sets" },
  kanaka: { ar: "الكنك", en: "Coffee pots" },
  soany: { ar: "الصواني", en: "Trays" },
  cup: { ar: "الفناجين", en: "Copper cups" },
  "zgagh-oakoab-almyah": { ar: "أدوات المياه", en: "Waterware" },
  "mntjat-alsdf-altbyaay": { ar: "قطع الصدف", en: "Shell pieces" },
  mbakhr: { ar: "المباخر", en: "Incense burners" },
};

export function displayShortCategoryName(id: string, nameAr: string, locale: Locale, nameEn?: string | null): string {
  return shortCategoryNames[id]?.[locale] ?? displayCategoryName(id, nameAr, locale, nameEn);
}
