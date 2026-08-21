import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CatalogBackdrop } from "@/components/catalog-backdrop";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileProvider } from "@/features/profiles/ProfileProvider";
import { ProfileRouteGuard } from "@/features/profiles/components/ProfileRouteGuard";
import { ProfileSwitcher } from "@/features/profiles/components/ProfileSwitcher";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Job Engine",
  description:
    "Local personal job-search tool for multiple roles and applicant profiles.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="relative min-h-dvh">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="job-engine-theme"
          disableTransitionOnChange
        >
          <ProfileProvider>
            <CatalogBackdrop />
            <header className="relative z-10">
              <div className="site-header">
                <div className="site-header-identity">
                  <p className="text-foreground tracking-tight">Job Engine</p>
                  <nav aria-label="Primary navigation" className="site-navigation">
                    <Link href="/jobs">Jobs</Link>
                    <Link href="/applications">Applications</Link>
                    <Link href="/profile">Profile</Link>
                  </nav>
                </div>
                <div className="site-header-controls">
                  <ProfileSwitcher />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="relative z-10">
              <ProfileRouteGuard>{children}</ProfileRouteGuard>
            </main>
          </ProfileProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
