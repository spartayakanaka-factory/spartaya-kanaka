"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/icon";
import type { Locale } from "@/lib/types";

type Choice = {
  label: string;
  name: string;
  src: string;
  href: string;
  width: number;
  height: number;
  unoptimized?: boolean;
};

export function HeroShowcase({ choices, locale }: { choices: Choice[]; locale: Locale }) {
  const [active, setActive] = useState(0);
  const choice = choices[active];
  if (!choice) return null;
  return (
    <div className="hero-showcase">
      <figure className="hero-photograph">
        <Image
          key={choice.src}
          className="hero-photo"
          src={choice.src}
          alt={choice.name}
          lang="ar"
          unoptimized={choice.unoptimized}
          width={choice.width}
          height={choice.height}
          preload={active === 0}
          loading="eager"
          sizes="(max-width: 700px) 100vw, 60vw"
        />
        <figcaption className="hero-caption">
          <Link href={choice.href}>
            <span lang="ar" dir="rtl">
              {choice.name}
            </span>
            <Icon name="arrow" />
          </Link>
        </figcaption>
      </figure>
      <div
        className="hero-choices"
        role="group"
        aria-label={locale === "ar" ? "استكشف طقوس القهوة" : "Explore the coffee ritual"}
      >
        {choices.map((item, index) => (
          <button
            key={item.href}
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <noscript>
        <a href={choices[0].href}>
          {locale === "ar" ? "اكتشف طقم القهوة" : "Explore the coffee set"}
        </a>
      </noscript>
    </div>
  );
}
