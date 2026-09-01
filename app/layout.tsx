import type { Metadata } from "next";
import "./globals.css";

const brandLogo =
  "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

export const metadata: Metadata = {
  title: "Sanmine Space",
  description: "Your AI workspace for research, leads and outreach.",
  icons: {
    icon: brandLogo,
    shortcut: brandLogo,
    apple: brandLogo,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
