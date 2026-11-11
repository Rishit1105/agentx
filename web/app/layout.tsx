import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const jet = JetBrains_Mono({ variable: "--font-jet", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meridian · Speak the market",
  description: "Voice-native paper-trading desk for NSE India: one Conductor, sixteen agents, five defence layers, zero real money.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#f6f5f1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${space.variable} ${jet.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
