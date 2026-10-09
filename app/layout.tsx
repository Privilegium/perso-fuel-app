import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111913",
};

export const metadata: Metadata = {
  title: "Моє пальне — журнал заправок",
  description: "Особистий журнал заправок, витрат і пробігу.",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Моє пальне",
    statusBarStyle: "black-translucent",
  },
  other: {
    "codex-preview": "development",
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
    <html lang="uk" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const themeDefaultKey = "fuel-log-theme-default-v2"; if (localStorage.getItem(themeDefaultKey) !== "1") { localStorage.setItem("fuel-log-theme", "dark"); localStorage.setItem(themeDefaultKey, "1"); } document.documentElement.dataset.theme = localStorage.getItem("fuel-log-theme") === "light" ? "light" : "dark"; } catch { document.documentElement.dataset.theme = "dark"; } const themeColor = document.documentElement.dataset.theme === "light" ? "#f5f7f5" : "#111913"; let themeColorMeta = document.querySelector('meta[name="theme-color"]'); if (!themeColorMeta) { themeColorMeta = document.createElement("meta"); themeColorMeta.setAttribute("name", "theme-color"); document.head.appendChild(themeColorMeta); } themeColorMeta.setAttribute("content", themeColor);`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
