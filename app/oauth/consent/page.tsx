import { Suspense } from "react";
import { FullScreenLoading } from "@/components/ui/loading";
import { OAuthConsent } from "./oauth-consent";

export default function OAuthConsentPage() {
	return (
		<Suspense fallback={<FullScreenLoading label="Loading authorization request…" />}>
			<OAuthConsent />
		</Suspense>
	);
}
