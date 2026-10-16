import type { Metadata, Viewport } from "next";
import "./globals.css";
import { journalBootstrap } from "@/lib/journal-bootstrap";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111913",
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
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: journalBootstrap }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const themeDefaultKey = "fuel-log-theme-default-v2"; if (localStorage.getItem(themeDefaultKey) !== "1") { localStorage.setItem("fuel-log-theme", "dark"); localStorage.setItem(themeDefaultKey, "1"); } document.documentElement.dataset.theme = localStorage.getItem("fuel-log-theme") === "light" ? "light" : "dark"; } catch { document.documentElement.dataset.theme = "dark"; } const isDark = document.documentElement.dataset.theme !== "light"; const themeColor = isDark ? "#111913" : "#f5f7f5"; let themeColorMeta = document.querySelector('meta[name="theme-color"]'); if (!themeColorMeta) { themeColorMeta = document.createElement("meta"); themeColorMeta.setAttribute("name", "theme-color"); document.head.appendChild(themeColorMeta); } themeColorMeta.setAttribute("content", themeColor); const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'); if (statusBarMeta) statusBarMeta.setAttribute("content", isDark ? "black-translucent" : "default");`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
