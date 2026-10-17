import type { Metadata } from "next";
import { Archivo, Barlow } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "TierUp · Team Up, TierUp", template: "%s · TierUp" },
  description: "Peer tutoring for DMV high schools. Students tutoring students, approved by your teachers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${barlow.variable} antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
