import type { Metadata, Viewport } from "next";
import { fontText } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXT · закрытый клуб",
  description: "Закрытый клуб русскоязычных украинцев и русских в Германии",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#151515",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${fontText.variable} h-full antialiased`}>
      <body className="min-h-full bg-void text-fg">
        {children}
      </body>
    </html>
  );
}
