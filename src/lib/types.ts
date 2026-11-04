export type Locale = "ar" | "en";

export interface CatalogVariant {
  id: string;
  nameAr: string;
  nameEn: string | null;
  sku: string | null;
  options: Record<string, string>;
  priceMinor: number | null;
  available?: boolean;
}

export interface CatalogImage {
  localPath: string;
  publicUrl?: string;
  sourceUrl: string;
  width: number | null;
  height: number | null;
  alt: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  originalUrl: string;
  nameAr: string;
  descriptionAr: string;
  nameEn?: string | null;
  descriptionEn?: string | null;
  productionDays?: { min: number; max: number };
  categoryNamesAr: string[];
  categoryUrls: string[];
  categoryIds?: string[];
  categoryNamesEn?: string[];
  categoryNeedsReview: boolean;
  sourcePrice: string | null;
  sourceCurrency: string | null;
  priceMinor?: number | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  productType?: "READY_MADE" | "MADE_TO_ORDER" | null;
  availability?: "AVAILABLE" | "UNAVAILABLE";
  featured?: boolean;
  variants?: CatalogVariant[];
  images: CatalogImage[];
  purchasable: false;
}

export interface CatalogCategory {
  id: string;
  nameAr: string;
  originalUrl: string;
  productUrls: string[];
  productCount: number;
  nameEn?: string | null;
  image?: CatalogImage | null;
  featured?: boolean;
}
