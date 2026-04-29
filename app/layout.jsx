import "./globals.css";

export const metadata = {
  title: "PIXEL/CHECK — Floodlight & GTM Piggyback Auditor",
  description: "Fire your CM360 Floodlight in headless Chrome and audit every piggyback that loads.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
