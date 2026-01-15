/**
 * Layout shell for Pairlane pages.
 * See README.md for the flow overview; used by TopPage and RoomPage.
 */

import { ViteClient } from "vite-ssr-components/hono";
import type { Translations, Locale } from "../i18n";
import { supportedLocales, getTranslations } from "../i18n";

type LayoutProps = {
  title: string;
  children: any;
  scripts?: any;
  bodyAttrs?: Record<string, string>;
  t: Translations;
  locale: Locale;
  url?: string;
};

export function Layout({ title, children, scripts, bodyAttrs = {}, t, locale, url }: LayoutProps) {
  const baseUrl = url ? new URL(url).origin : "";
  const pageUrl = url || baseUrl;

  return (
    <html lang={locale}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#f5f5f0" />
        <meta name="description" content={t.description} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={t.description} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="FluxShare" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={t.description} />

        {/* Favicon - Force Clear Tab Icon */}
        <link rel="icon" href="data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" />
        <link rel="shortcut icon" href="data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" />

        <title>{title}</title>
        <ViteClient />
        <link rel="stylesheet" href="/style.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LOCALE__=${JSON.stringify(locale)};window.__TRANSLATIONS__=${JSON.stringify(t)};`,
          }}
        />
      </head>
      <body {...bodyAttrs}>
        <header class="topbar">
          <div class="brand-group">
            <a href="/" class="brand">{t.header.brand}</a>
            <div class="sub">{t.header.sub}</div>
          </div>
          <div class="langSwitcher">
            {supportedLocales.map((l) => {
              const langT = getTranslations(l);
              const isActive = l === locale;
              return (
                <a
                  href={`?lang=${l}`}
                  class={`langBtn${isActive ? " active" : ""}`}
                  title={langT.langName}
                  onclick={`event.preventDefault();location.href='?lang=${l}'+location.hash;`}
                >
                  {l.toUpperCase()}
                </a>
              );
            })}
          </div>
        </header>

        <main class="container">{children}</main>

        <footer class="main-footer">
          <div class="footer-content">
            {t.home.madeBy}
          </div>
        </footer>

        {scripts}
      </body>
    </html>
  );
}
