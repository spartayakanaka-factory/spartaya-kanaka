"use client";

import Image from "next/image";
import { useState } from "react";

export function CategoryCover({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="admin-category-cover" title={label}>
      {failed ? (
        <span className="admin-category-cover-fallback" aria-label={label} role="img">—</span>
      ) : (
        <Image
          alt={label}
          height={44}
          width={44}
          loading="lazy"
          unoptimized
          src={src}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
