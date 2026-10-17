import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { AsciiField } from "@/components/ascii/ascii-field";
import { BOOT_GUARD, BootSequence } from "@/components/boot-sequence";
import { GlassGlow } from "@/components/glass/glass-glow";
import { TabBar } from "@/components/glass/tab-bar";
import { SettingsSheet } from "@/components/settings-sheet";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/users";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Departure Mono (OFL 1.1, ver app/fonts/DepartureMono-LICENSE.txt). Nítida solo en 11/22/33/44 px.
const departure = localFont({ src: "./fonts/DepartureMono-Regular.woff2", variable: "--font-departure", display: "swap" });

export const metadata: Metadata = {
  title: "build101",
  description: "Observabilidad del developer: tu cuerpo y tu trabajo en el mismo gráfico.",
  appleWebApp: { capable: true, title: "build101", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0c12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="es" suppressHydrationWarning className={`dark ${geistSans.variable} ${geistMono.variable} ${departure.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_GUARD }} />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        <BootSequence />
        <AsciiField />
        <GlassGlow />
        <div id="app" className="mx-auto flex min-h-dvh max-w-md flex-col">
          <header className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]" style={{ viewTransitionName: "app-header" }}>
            <span className="font-pixel text-[22px] leading-none text-dim">
              ~/<span className="text-foreground">build101</span>
            </span>
            <SettingsSheet currentUserId={user.id} />
          </header>
          <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] pt-1">{children}</main>
        </div>
        <TabBar />
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
