import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./components/Providers";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const sora = Sora({
	variable: "--font-sora",
	subsets: ["latin"],
	weight: ["800"],
});

export const viewport: Viewport = {
	viewportFit: "cover",
};

export const metadata: Metadata = {
	title: "Springa",
	description: "Training planner and workout tracker with T1D blood glucose management, synced to Intervals.icu.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} antialiased`}
			>
				<Providers>{children}</Providers>
				<SpeedInsights />
			</body>
		</html>
	);
}
