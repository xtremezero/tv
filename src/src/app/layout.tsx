import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TV",
  description:
    "A pseudo-linear television system: aggregate YouTube, Vimeo and Dailymotion playlists into scheduled virtual channels with interleaved programming, CRT sensory emulation and remote-control operation.",
  keywords: ["pseudo-TV", "linear television", "virtual channel", "playlist", "YouTube", "Vimeo", "Dailymotion"],
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || '/tv'}/logo.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
