import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bangla Video Studio",
  description: "Local-first AI video studio: Bengali voice to cartoon, explainer and tutorial videos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
