import assert from "node:assert/strict";
import test from "node:test";
import {
	getEffectiveAvatar,
	getProviderAvatarFromMetadata,
} from "../lib/profile-avatar";

test("extracts only provider-specific avatar metadata", () => {
	assert.equal(
		getProviderAvatarFromMetadata({
			avatar_url_google: "https://provider.example/google",
			picture: "https://provider.example/picture",
			avatar_url: "https://app.example/manual",
		}),
		"https://provider.example/google",
	);
	assert.equal(
		getProviderAvatarFromMetadata({
			picture: "https://provider.example/picture",
			avatar_url: "https://app.example/manual",
		}),
		"https://provider.example/picture",
	);
	assert.equal(
		getProviderAvatarFromMetadata({
			avatar_url: "https://app.example/manual",
		}),
		null,
	);
});

test("manual avatar wins and provider is the fallback", () => {
	assert.equal(
		getEffectiveAvatar(
			"https://app.example/manual",
			"https://provider.example/avatar",
		),
		"https://app.example/manual",
	);
	assert.equal(
		getEffectiveAvatar(null, "https://provider.example/avatar"),
		"https://provider.example/avatar",
	);
	assert.equal(getEffectiveAvatar(null, null), null);
});
