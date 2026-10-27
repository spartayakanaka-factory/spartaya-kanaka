export const site = {
  name: "Sprtaya & Kanaka",
  nameAr: "سبرتاية وكنكة",
  currentSourceUrl: "https://www.sprtaya-kanaka.net",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  factoryPhone: "+201142800111",
  wholesaleCategoryId: "ksm-aljml-oaltsdyr",
  featuredCategoryIds: ["sprtaya-kanaka", "atkm-kho", "mntjat-alsdf-altbyaay", "soany"],
  featuredProductIds: ["1bfab0186a7c", "7e3a9e813cfe", "45c5b52bf609", "74c40ee0169b"],
};
export const absolutePhone = site.factoryPhone;
export const whatsappNumber = site.factoryPhone.replace(/\D/g, "");
