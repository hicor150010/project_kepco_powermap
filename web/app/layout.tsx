import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KEPCO 배전선로 여유용량 지도",
  description: "배전선로 여유용량 시각화 지도 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
