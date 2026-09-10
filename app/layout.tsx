import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "景觀空間定義互動設計",
  description: "從水平垂直分割、弧線分割到 1/100 基地喬木配置的景觀設計互動練習。",
  metadataBase: new URL("https://landscape-space-studio.jerry428tw.chatgpt.site"),
  openGraph: {
    title: "景觀空間定義互動設計",
    description: "從平面構圖到空間秩序",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "景觀空間定義互動設計" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "景觀空間定義互動設計",
    description: "從平面構圖到空間秩序",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
