import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Engine",
  description:
    "Personal job-search engine for software-development roles. V1 search is being built.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header>
          <p>Job Engine</p>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
