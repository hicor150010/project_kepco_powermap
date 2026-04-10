import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

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
    <html lang="ko" className="h-dvh antialiased">
      <body className="h-dvh flex flex-col overscroll-none">{children}</body>
    </html>
  );
}
