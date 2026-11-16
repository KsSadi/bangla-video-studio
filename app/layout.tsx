import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bangla Video Studio",
  description: "Local-first AI video studio: Bengali voice to cartoon, explainer and tutorial videos.",
};

const themeInit = `try{var t=localStorage.getItem("bvs-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
