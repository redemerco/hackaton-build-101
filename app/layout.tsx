import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { UserSwitcher } from "@/components/user-switcher";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/users";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "build101",
  description: "Observabilidad del developer: tu cuerpo y tu trabajo en el mismo gráfico.",
  appleWebApp: { capable: true, title: "build101", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="es" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground font-sans">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
              build101
            </span>
            <UserSwitcher currentUserId={user.id} />
          </header>
          <main className="flex-1 px-4 py-5 pb-24">{children}</main>
          <BottomNav />
        </div>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
