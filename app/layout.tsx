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
            __html: `try { if (localStorage.getItem("fuel-log-theme") === "dark") document.documentElement.dataset.theme = "dark"; } catch {}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
