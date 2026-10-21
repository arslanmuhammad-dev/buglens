import "./style.css";
import type { Metadata } from "next";
import { appUrl } from "../lib/config";
const description =
  "Turn website problems into actionable bug reports with screenshots, diagnostics and a private developer dashboard.";
export const metadata: Metadata = {
  metadataBase: new URL(appUrl() || "http://127.0.0.1:3000"),
  title: "BugLens — The whole picture.",
  description,
  openGraph: {
    title: "BugLens — Bug reports with the whole picture.",
    description,
    siteName: "BugLens",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BugLens — The whole picture.",
    description,
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
