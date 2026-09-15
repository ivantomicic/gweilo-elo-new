import type { Metadata } from "next";
import { MascotPlayground } from "./playground";

export const metadata: Metadata = {
	title: "Gweilo · Maskota",
	robots: { index: false, follow: false },
};

export default function MascotPage() {
	return <MascotPlayground />;
}
