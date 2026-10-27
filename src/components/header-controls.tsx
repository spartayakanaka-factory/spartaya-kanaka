"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Locale } from "@/lib/types";

type Panel = "search" | "menu" | "account" | "cart";
type NavItem = { href: string; label: string };

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const next = locale === "ar" ? "en" : "ar";
  const href = pathname.replace(/^\/(ar|en)(?=\/|$)/, "/" + next);
  return (
    <a
      className="language-link"
      href={href}
      lang={next}
      hrefLang={next}
      onClick={(event) => {
        event.currentTarget.href = href + window.location.search + window.location.hash;
      }}
    >
      {locale === "ar" ? "English" : "العربية"}
    </a>
  );
}

export function HeaderControls({ locale, links, factoryPhone }: { locale: Locale; links: NavItem[]; factoryPhone: string }) {
  const ar = locale === "ar";
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState<Panel>("search");
  const labels = {
    search: ar ? "البحث" : "Search",
    menu: ar ? "القائمة" : "Menu",
    account: ar ? "الحساب" : "Account",
    cart: ar ? "حقيبة التسوق" : "Shopping bag",
  };
  function open(next: Panel) {
    returnFocus.current = document.activeElement as HTMLElement;
    setPanel(next);
    dialog.current?.showModal();
    if (next === "search" && window.matchMedia("(min-width: 700px)").matches) {
      requestAnimationFrame(() => search.current?.focus());
    }
  }
  function close() {
    dialog.current?.close();
  }
  function switchPanel(next: "account" | "cart") {
    const current = dialog.current;
    if (!current?.open) {
      open(next);
      return;
    }
    setPanel(next);
    current.close();
    requestAnimationFrame(() => {
      if (!current.isConnected) return;
      current.showModal();
      current.querySelector<HTMLElement>(".commerce-state .button")?.focus();
    });
  }
  return (
    <>
      <div className="header-actions">
        <LanguageSwitch locale={locale} />
        <button className="icon-button" aria-label={labels.search} onClick={() => open("search")}>
          <Icon name="search" />
        </button>
        <button
          className="icon-button account-control"
          aria-label={labels.account}
          onClick={() => open("account")}
        >
          <Icon name="user" />
        </button>
        <button className="icon-button" aria-label={labels.cart} onClick={() => open("cart")}>
          <Icon name="bag" />
        </button>
        <button
          className="icon-button mobile-menu-button"
          aria-label={labels.menu}
          onClick={() => open("menu")}
        >
          <Icon name="menu" />
        </button>
      </div>
      <dialog
        ref={dialog}
        className={"header-dialog panel-" + panel}
        aria-labelledby="header-panel-title"
        onClose={() => {
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, a[href], input, select, [tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="dialog-content">
          <div className="dialog-heading">
            <h2 id="header-panel-title">{labels[panel]}</h2>
            <button className="icon-button" aria-label={ar ? "إغلاق" : "Close"} onClick={close}>
              <Icon name="close" />
            </button>
          </div>
          {panel === "search" ? (
            <>
              <form action={"/" + locale + "/search"} role="search">
                <label htmlFor="header-search">
                  {ar ? "ما القطعة التي تبحث عنها؟" : "Find your next piece"}
                </label>
                <div className="search-field">
                  <input
                    ref={search}
                    id="header-search"
                    type="search"
                    name="q"
                    autoComplete="off"
                    placeholder={ar ? "كنكة، طقم قهوة، صينية…" : "Coffee sets, trays, copper…"}
                  />
                  <button className="icon-button" type="submit" aria-label={labels.search}>
                    <Icon name="search" />
                  </button>
                </div>
              </form>
              <p>{ar ? "أو استكشف المجموعات" : "Or explore the collections"}</p>
              <nav
                className="dialog-links"
                aria-label={ar ? "مجموعات مقترحة" : "Suggested collections"}
              >
                {links.slice(1, 5).map((link) => (
                  <Link key={link.href} href={link.href} onClick={close}>
                    {link.label}
                    <Icon name="arrow" />
                  </Link>
                ))}
              </nav>
            </>
          ) : panel === "menu" ? (
            <>
              <nav className="dialog-links" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
                {links.map((link) => (
                  <Link key={link.href} href={link.href} onClick={close}>
                    {link.label}
                    <Icon name="arrow" />
                  </Link>
                ))}
              </nav>
              <a className="button" href={"tel:" + factoryPhone}>
                <Icon name="phone" />
                {ar ? "اتصل بالمصنع" : "Call the factory"}
              </a>
              <div className="mobile-commerce-links">
                <button className="button button-light" onClick={() => switchPanel("account")} type="button">
                  <Icon name="user" />
                  {labels.account}
                </button>
                <button className="button button-light" onClick={() => switchPanel("cart")} type="button">
                  <Icon name="bag" />
                  {labels.cart}
                </button>
              </div>
              <LanguageSwitch locale={locale} />
            </>
          ) : (
            <div className="commerce-state">
              <Icon name={panel === "cart" ? "bag" : "user"} width={42} height={42} />
              <h3>
                {ar
                  ? panel === "cart"
                    ? "الطلب يبدأ بمكالمة"
                    : "أهلاً بك في سبرتاية وكنكة"
                  : panel === "cart"
                    ? "A conversation before an order"
                    : "Welcome to Sprtaya & Kanaka"}
              </h3>
              <p>
                {ar
                  ? panel === "cart"
                    ? "الطلب والدفع الإلكتروني غير متاحين حالياً. تواصل معنا لمعرفة السعر والتوافر وتفاصيل الشراء."
                    : "حسابات العملاء غير متاحة حالياً. يمكنك تصفح كل القطع والتواصل مباشرة مع المصنع."
                  : panel === "cart"
                    ? "Online ordering and payment are not available yet. Call us to confirm price, availability and purchase details."
                    : "Customer accounts are not available yet. Explore the complete collection and speak directly with the factory."}
              </p>
              <a className="button" href={"tel:" + factoryPhone}>
                <Icon name="phone" />
                {ar ? "اتصل بالمصنع" : "Call the factory"}
              </a>
              <Link className="text-link" href={"/" + locale + "/products"} onClick={close}>
                {ar ? "تصفح كل القطع" : "Explore all pieces"}
                <Icon name="arrow" />
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
