import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { OAuthConsent } from "./oauth-consent";

export default function OAuthConsentPage() {
	return (
		<Suspense fallback={<Loading label="Loading authorization request…" />}>
			<OAuthConsent />
		</Suspense>
	);
}
