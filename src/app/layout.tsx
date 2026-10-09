import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { DataProvider } from "@/components/shell/data-provider";
import { themeScript } from "@/components/shell/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cadence — Journey Orchestration",
  description:
    "Local proof of concept for a customer journey orchestration platform. All data is fictional.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TooltipProvider delayDuration={300}>
          <DataProvider>{children}</DataProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--foreground)] !rounded-lg !shadow-lg",
                description: "!text-[var(--muted-foreground)]",
              },
            }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
