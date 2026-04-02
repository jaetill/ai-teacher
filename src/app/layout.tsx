import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import NavBar from "@/components/NavBar";
import CopilotProvider from "@/components/CopilotProvider";
import CopilotPanel from "@/components/CopilotPanel";
import MainContent from "@/components/MainContent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Teacher",
  description: "Teacher planning and daily operations system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">
        <SessionProvider>
          <CopilotProvider>
            <NavBar />
            <MainContent>{children}</MainContent>
            <CopilotPanel />
          </CopilotProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
