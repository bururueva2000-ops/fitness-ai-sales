import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-фитнес консультант | форма.",
  description: "Подбери онлайн-фитнес-программу под свою цель, опыт и ритм жизни.",
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
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
