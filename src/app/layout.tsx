import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { LoadingProvider } from "@/providers/LoadingProvider";
import { AppProvider } from "@/providers/AppProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "OPAL LAB - מערכת ניהול מעבדה",
  description: "מערכת ניהול מעבדת שיניים דיגיטלית OPAL LAB",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "OPAL LAB",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full bg-slate-50 font-sans antialiased">
        <LoadingProvider>
          <AppProvider>{children}</AppProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}
