import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Моє пальне — журнал заправок",
  description: "Особистий журнал заправок, витрат і пробігу.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
            __html: `try { const themeDefaultKey = "fuel-log-theme-default-v2"; if (localStorage.getItem(themeDefaultKey) !== "1") { localStorage.setItem("fuel-log-theme", "dark"); localStorage.setItem(themeDefaultKey, "1"); } document.documentElement.dataset.theme = localStorage.getItem("fuel-log-theme") === "light" ? "light" : "dark"; } catch { document.documentElement.dataset.theme = "dark"; }`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
