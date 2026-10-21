import "./style.css";
export const metadata = {
  title: "BugLens — The whole picture.",
  description: "Actionable bug reports with context.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
