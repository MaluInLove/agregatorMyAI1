import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI-агрегатор — стенд интеграции",
  description: "Закрытый локальный стенд этапа 0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
