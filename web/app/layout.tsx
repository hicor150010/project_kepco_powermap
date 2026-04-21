import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "SUNLAP · Power Grid Map",
    template: "%s | SUNLAP",
  },
  description: "한국전력 배전선로 여유용량을 지도에서 한눈에 확인하세요.",
  applicationName: "SUNLAP",
  openGraph: {
    title: "SUNLAP · Power Grid Map",
    description: "한국전력 배전선로 여유용량을 지도에서 한눈에 확인하세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "SUNLAP",
  },
  twitter: {
    card: "summary",
    title: "SUNLAP · Power Grid Map",
    description: "한국전력 배전선로 여유용량을 지도에서 한눈에 확인하세요.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="min-h-dvh antialiased">
      <body className="min-h-dvh flex flex-col overscroll-none bg-gray-50">{children}</body>
    </html>
  );
}
