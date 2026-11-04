"use client";

import { useState } from "react";
import Image from "next/image";
import { getProductImageUrl } from "@/lib/asset-url";
import { Icon } from "@/components/icon";
import type { CatalogImage, Locale } from "@/lib/types";

export function ProductGallery({
  images,
  name,
  locale,
}: {
  images: CatalogImage[];
  name: string;
  locale: Locale;
}) {
  const [active, setActive] = useState(0);
  const selected = images[active] ?? images[0];
  const ar = locale === "ar";
  const move = (delta: number) =>
    setActive((index) => (index + delta + images.length) % images.length);
  const format = new Intl.NumberFormat(locale);
  if (!selected)
    return (
      <div className="gallery-empty">
        {ar ? "صور القطعة غير متاحة حالياً." : "Images are currently unavailable."}
      </div>
    );
  return (
    <div className="product-gallery">
      <div className="gallery-main">
        <Image
          src={getProductImageUrl(selected)}
          alt={selected.alt || name}
          lang="ar"
          unoptimized={Boolean(selected.publicUrl)}
          preload
          sizes="(max-width: 700px) 90vw, 50vw"
          width={selected.width ?? 900}
          height={selected.height ?? 1200}
        />
        <span className="gallery-index" aria-live="polite" aria-atomic="true">
          <bdi dir="ltr">{format.format(active + 1)} / {format.format(images.length)}</bdi>
        </span>
        {images.length > 1 ? (
          <div className="gallery-controls">
            <button
              className="icon-button"
              onClick={() => move(ar ? 1 : -1)}
              aria-label={ar ? "الصورة التالية" : "Previous image"}
            >
              <Icon name="arrow" />
            </button>
            <button
              className="icon-button"
              onClick={() => move(ar ? -1 : 1)}
              aria-label={ar ? "الصورة السابقة" : "Next image"}
            >
              <Icon name="arrow" />
            </button>
          </div>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div
          className="gallery-thumbs"
          role="group"
          aria-label={ar ? "اختر صورة للقطعة" : "Choose a product image"}
        >
          {images.map((image, index) => (
            <button
              key={image.publicUrl ?? image.localPath}
              type="button"
              className={index === active ? "gallery-thumb is-active" : "gallery-thumb"}
              onClick={() => setActive(index)}
              aria-label={(ar ? "عرض الصورة " : "Show image ") + format.format(index + 1)}
              aria-pressed={index === active}
            >
              <Image
                src={getProductImageUrl(image)}
                alt=""
                loading="lazy"
                unoptimized={Boolean(image.publicUrl)}
                sizes="70px"
                width={image.width ?? 180}
                height={image.height ?? 240}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
