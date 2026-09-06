import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WatermarkJ&Ohm — ตัวเพิ่มลายน้ำอัตโนมัติ",
  description: "เพิ่มลายน้ำโลโก้หรือข้อความลงในรูปภาพอัตโนมัติ รองรับ tile mode, ปรับขนาด ความเข้ม ตำแหน่งได้",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
