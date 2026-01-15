/**
 * Top page UI for Pairlane.
 * See README.md for the user flow; pairs with RoomPage and the home script.
 */

import { Script } from "vite-ssr-components/hono";
import { Layout } from "./layout";
import type { Translations, Locale } from "../i18n";

type TopPageProps = {
  t: Translations;
  locale: Locale;
  url?: string;
};

export function TopPage({ t, locale, url }: TopPageProps) {
  return (
    <Layout
      title={t.title}
      scripts={<Script src="/src/client/home.tsx" />}
      t={t}
      locale={locale}
      url={url}
    >
      <section id="homeView" class="home">
        <div class="homeGrid">
          <div class="homeHero">
            <h1 dangerouslySetInnerHTML={{ __html: t.home.heroTitle }} />
            <p class="heroLead">{t.home.heroLead}</p>
            
            <div class="homePanel">
              <div class="panelBlock">
                <div class="panelTitle">{t.home.sendTitle}</div>
                <div class="inputGroup">
                  <label class="toggle">
                    <input id="encryptToggle" type="checkbox" checked />
                    <span>{t.home.encryptOn}</span>
                  </label>
                  <div class="field">
                    <span class="muted small">{t.home.maxConcurrent}</span>
                    <input id="maxConcurrent" class="input" type="number" min="1" max="10" value="3" />
                  </div>
                </div>
                <button id="createBtn" class="btn primary">{t.home.createRoom}</button>
              </div>

              <div class="panelBlock">
                <div class="panelTitle">{t.home.receiveTitle}</div>
                <div class="inputGroup">
                  <input id="joinCode" class="input" placeholder={t.home.codePlaceholder} />
                  <button id="joinBtn" class="btn">{t.home.join}</button>
                </div>
                <p class="muted small">{t.home.encryptHint}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
