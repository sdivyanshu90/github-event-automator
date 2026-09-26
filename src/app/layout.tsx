import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hookwise", template: "%s · Hookwise" },
  description: "Reliable, event-driven GitHub repository automation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="container topbar-inner">
            <Link className="brand" href="/"><span className="brand-mark">◆</span> Hookwise</Link>
            <nav className="nav" aria-label="Primary"><Link href="/dashboard">Dashboard</Link><Link href="/dashboard/activity">Activity</Link><Link href="/dashboard/rules">Rules</Link></nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
