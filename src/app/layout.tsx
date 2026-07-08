import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/providers/AppProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "OPAL LAB - מערכת ניהול מעבדה",
  description: "מערכת ניהול מעבדת שיניים דיגיטלית OPAL LAB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full bg-slate-50 font-sans antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
