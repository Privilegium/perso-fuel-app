import type { Metadata, Viewport } from "next";
import "./globals.css";
import { journalBootstrap } from "@/lib/journal-bootstrap";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export const metadata: Metadata = {
  title: "Моє пальне — журнал заправок",
  description: "Особистий журнал заправок, витрат і пробігу.",
  appleWebApp: {
    capable: true,
    title: "Моє пальне",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/fuel-icon.svg",
    shortcut: "/fuel-icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" data-fuel-app="journal" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `if (location.pathname !== "/") document.documentElement.dataset.fuelLaunch = "skip";` }} />
        <style dangerouslySetInnerHTML={{ __html: `#app-launch-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#111827;color:#eef2fb;font:500 16px -apple-system,BlinkMacSystemFont,sans-serif}html[data-theme="light"] #app-launch-loader{background:#f3f5fa;color:#202c43}html[data-fuel-launch="skip"] #app-launch-loader{display:none}#app-launch-loader>div{display:grid;justify-items:center;gap:18px}#app-launch-loader svg{width:38px;height:38px;color:#a9bafc;animation:fuel-launch-spin 1s linear infinite}@keyframes fuel-launch-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#app-launch-loader svg{animation:none}}` }} />
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: journalBootstrap }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const themeDefaultKey = "fuel-log-theme-default-v2"; if (localStorage.getItem(themeDefaultKey) !== "1") { localStorage.setItem("fuel-log-theme", "dark"); localStorage.setItem(themeDefaultKey, "1"); } document.documentElement.dataset.theme = localStorage.getItem("fuel-log-theme") === "light" ? "light" : "dark"; } catch { document.documentElement.dataset.theme = "dark"; } const isDark = document.documentElement.dataset.theme !== "light"; const themeColor = isDark ? "#111827" : "#f3f5fa"; let themeColorMeta = document.querySelector('meta[name="theme-color"]'); if (!themeColorMeta) { themeColorMeta = document.createElement("meta"); themeColorMeta.setAttribute("name", "theme-color"); document.head.appendChild(themeColorMeta); } themeColorMeta.setAttribute("content", themeColor); const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'); if (statusBarMeta) statusBarMeta.setAttribute("content", isDark ? "black-translucent" : "default");`,
          }}
        />
      </head>
      <body className="antialiased">
        <div id="app-launch-loader" role="status" aria-label="Завантаження застосунку">
          <div><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" opacity=".2"/><path d="M20 4a16 16 0 0 1 16 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg><span>Завантажую журнал…</span></div>
        </div>
        <noscript><style>{`#app-launch-loader{display:none}`}</style><p>Увімкніть JavaScript, щоб користуватися журналом.</p></noscript>
        {children}
      </body>
    </html>
  );
}
