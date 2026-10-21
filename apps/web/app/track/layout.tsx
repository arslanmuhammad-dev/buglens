import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Private report · BugLens",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
