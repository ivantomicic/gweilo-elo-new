import { randomUUID, sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";

export type APNsEnvironment = "development" | "production";

export type APNsDevice = {
	id: string;
	token: string;
	environment: APNsEnvironment;
};

export type APNsPayload = {
	aps: {
		alert: {
			title: string;
			body: string;
		};
		sound: "default";
		"thread-id"?: string;
	};
	[key: string]: unknown;
};

export type APNsLiveActivityPayload = {
	aps: {
		timestamp: number;
		event: "start" | "update" | "end";
		"content-state": Record<string, unknown>;
		"attributes-type"?: string;
		attributes?: Record<string, unknown>;
		"input-push-token"?: 1;
		"stale-date"?: number;
		"dismissal-date"?: number;
		alert?: {
			title: string;
			body: string;
			sound?: "default";
		};
	};
};

export type APNsResult = {
	deviceId: string;
	apnsId: string;
	status: number;
	reason?: string;
	succeeded: boolean;
	shouldInvalidateToken: boolean;
	configurationRequired?: boolean;
};

type APNsConfiguration = {
	keyId: string;
	teamId: string;
	privateKey: string;
	bundleId: string;
};

let cachedProviderToken:
	| { value: string; generatedAtSeconds: number; cacheKey: string }
	| undefined;

function base64URL(value: Buffer | string) {
	return Buffer.from(value)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function environmentPrefix(environment: APNsEnvironment) {
	return environment === "development"
		? "APNS_DEVELOPMENT"
		: "APNS_PRODUCTION";
}

function loadConfiguration(
	environment: APNsEnvironment,
): APNsConfiguration | null {
	const prefix = environmentPrefix(environment);
	const keyId =
		process.env[`${prefix}_KEY_ID`] || process.env.APNS_KEY_ID;
	const teamId = process.env.APNS_TEAM_ID;
	const bundleId =
		process.env.APNS_BUNDLE_ID || "com.ivantomicic.gweilo";
	const encodedPrivateKey =
		process.env[`${prefix}_PRIVATE_KEY_BASE64`] ||
		process.env.APNS_PRIVATE_KEY_BASE64;
	const plainPrivateKey =
		process.env[`${prefix}_PRIVATE_KEY`] ||
		process.env.APNS_PRIVATE_KEY;
	const privateKey = encodedPrivateKey
		? Buffer.from(encodedPrivateKey, "base64").toString("utf8")
		: plainPrivateKey?.replace(/\\n/g, "\n");

	if (!keyId || !teamId || !privateKey || !bundleId) {
		return null;
	}

	return { keyId, teamId, privateKey, bundleId };
}

export function isAPNsConfigured(environment: APNsEnvironment) {
	return loadConfiguration(environment) !== null;
}

function providerToken(configuration: APNsConfiguration) {
	const generatedAtSeconds = Math.floor(Date.now() / 1000);
	const cacheKey = `${configuration.teamId}:${configuration.keyId}`;
	if (
		cachedProviderToken &&
		cachedProviderToken.cacheKey === cacheKey &&
		generatedAtSeconds - cachedProviderToken.generatedAtSeconds < 50 * 60
	) {
		return cachedProviderToken.value;
	}

	const header = base64URL(
		JSON.stringify({ alg: "ES256", kid: configuration.keyId }),
	);
	const claims = base64URL(
		JSON.stringify({
			iss: configuration.teamId,
			iat: generatedAtSeconds,
		}),
	);
	const unsignedToken = `${header}.${claims}`;
	const signature = sign(
		"sha256",
		Buffer.from(unsignedToken),
		{
			key: configuration.privateKey,
			dsaEncoding: "ieee-p1363",
		},
	);
	const value = `${unsignedToken}.${base64URL(signature)}`;
	cachedProviderToken = {
		value,
		generatedAtSeconds,
		cacheKey,
	};
	return value;
}

function endpoint(environment: APNsEnvironment) {
	return environment === "production"
		? "https://api.push.apple.com"
		: "https://api.sandbox.push.apple.com";
}

function parseReason(body: string) {
	if (!body) return undefined;
	try {
		const parsed = JSON.parse(body) as { reason?: string };
		return parsed.reason;
	} catch {
		return body;
	}
}

function shouldInvalidateToken(status: number, reason?: string) {
	return (
		status === 410 ||
		reason === "BadDeviceToken" ||
		reason === "DeviceTokenNotForTopic" ||
		reason === "Unregistered"
	);
}

export function isRetryableAPNsTransportFailure(
	result: Pick<APNsResult, "status" | "reason" | "succeeded">,
) {
	if (result.succeeded || result.status !== 0) return false;
	const reason = result.reason?.toLowerCase() || "";
	return [
		"refused_stream",
		"session closed",
		"stream closed",
		"goaway",
		"econnreset",
		"socket hang up",
		"request timed out",
	].some((fragment) => reason.includes(fragment));
}

function openConnection(environment: APNsEnvironment) {
	return new Promise<ClientHttp2Session>((resolve, reject) => {
		const client = connect(endpoint(environment));
		const timeout = setTimeout(() => {
			client.destroy();
			reject(new Error("APNs connection timed out"));
		}, 12_000);

		const cleanup = () => {
			clearTimeout(timeout);
			client.off("connect", handleConnect);
			client.off("error", handleError);
		};
		const handleConnect = () => {
			cleanup();
			// Stream-level errors are returned by sendOnConnection. Keep a
			// session listener so a late HTTP/2 error cannot crash the process.
			client.on("error", () => undefined);
			resolve(client);
		};
		const handleError = (error: Error) => {
			cleanup();
			client.destroy();
			reject(error);
		};

		client.once("connect", handleConnect);
		client.once("error", handleError);
	});
}

function sendOnConnection({
	client,
	device,
	payload,
	configuration,
	token,
	collapseId,
	pushType,
	topic,
	priority,
}: {
	client: ClientHttp2Session;
	device: APNsDevice;
	payload: Buffer;
	configuration: APNsConfiguration;
	token: string;
	collapseId?: string;
	pushType: "alert" | "liveactivity";
	topic: string;
	priority: "5" | "10";
}) {
	return new Promise<APNsResult>((resolve) => {
		const apnsId = randomUUID();
		const request = client.request({
			":method": "POST",
			":path": `/3/device/${device.token}`,
			authorization: `bearer ${token}`,
			"apns-topic": topic,
			"apns-push-type": pushType,
			"apns-priority": priority,
			"apns-id": apnsId,
			...(collapseId ? { "apns-collapse-id": collapseId } : {}),
		});
		let status = 0;
		let responseBody = "";
		let settled = false;

		const finish = (result: APNsResult) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};

		request.setEncoding("utf8");
		request.setTimeout(12_000, () => {
			request.close();
			finish({
				deviceId: device.id,
				apnsId,
				status: 0,
				reason: "APNs request timed out",
				succeeded: false,
				shouldInvalidateToken: false,
			});
		});
		request.on("response", (headers) => {
			status = Number(headers[":status"] || 0);
		});
		request.on("data", (chunk) => {
			responseBody += chunk;
		});
		request.on("end", () => {
			const reason = parseReason(responseBody);
			finish({
				deviceId: device.id,
				apnsId,
				status,
				reason,
				succeeded: status === 200,
				shouldInvalidateToken: shouldInvalidateToken(status, reason),
			});
		});
		request.on("error", (error) => {
			finish({
				deviceId: device.id,
				apnsId,
				status,
				reason: error.message,
				succeeded: false,
				shouldInvalidateToken: false,
			});
		});
		request.end(payload);
	});
}

async function retryTransportFailure({
	device,
	environment,
	payload,
	configuration,
	token,
	collapseId,
	pushType,
	topic,
	priority,
}: {
	device: APNsDevice;
	environment: APNsEnvironment;
	payload: Buffer;
	configuration: APNsConfiguration;
	token: string;
	collapseId?: string;
	pushType: "alert" | "liveactivity";
	topic: string;
	priority: "5" | "10";
}) {
	let client: ClientHttp2Session | null = null;
	try {
		client = await openConnection(environment);
		return await sendOnConnection({
			client,
			device,
			payload,
			configuration,
			token,
			collapseId,
			pushType,
			topic,
			priority,
		});
	} catch (error) {
		return {
			deviceId: device.id,
			apnsId: randomUUID(),
			status: 0,
			reason:
				error instanceof Error
					? error.message
					: "APNs connection failed",
			succeeded: false,
			shouldInvalidateToken: false,
		} satisfies APNsResult;
	} finally {
		client?.close();
	}
}

async function sendEnvironmentBatch({
	devices,
	environment,
	payload,
	collapseId,
	pushType,
	topicSuffix,
	priority,
}: {
	devices: APNsDevice[];
	environment: APNsEnvironment;
	payload: Buffer;
	collapseId?: string;
	pushType: "alert" | "liveactivity";
	topicSuffix?: string;
	priority: "5" | "10";
}): Promise<APNsResult[]> {
	if (devices.length === 0) return [];

	const configuration = loadConfiguration(environment);
	if (!configuration) {
		return devices.map((device) => ({
			deviceId: device.id,
			apnsId: randomUUID(),
			status: 0,
			reason: `APNs ${environment} credentials are not configured`,
			succeeded: false,
			shouldInvalidateToken: false,
			configurationRequired: true,
		}));
	}

	const token = providerToken(configuration);
	const topic = `${configuration.bundleId}${topicSuffix ?? ""}`;
	let client: ClientHttp2Session | null = null;
	let results: APNsResult[];

	try {
		client = await openConnection(environment);

		// A new token-authenticated APNs connection initially permits only one
		// stream. Establish authentication with the first request before
		// submitting the remaining devices concurrently.
		const firstResult = await sendOnConnection({
			client,
			device: devices[0],
			payload,
			configuration,
			token,
			collapseId,
			pushType,
			topic,
			priority,
		});
		const remainingResults =
			devices.length > 1
				? await Promise.all(
						devices.slice(1).map((device) =>
							sendOnConnection({
								client: client!,
								device,
								payload,
								configuration,
								token,
								collapseId,
								pushType,
								topic,
								priority,
							}),
						),
					)
				: [];
		results = [firstResult, ...remainingResults];
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "APNs connection failed";
		results = devices.map((device) => ({
			deviceId: device.id,
			apnsId: randomUUID(),
			status: 0,
			reason,
			succeeded: false,
			shouldInvalidateToken: false,
		}));
	} finally {
		client?.close();
	}

	const retryableDeviceIds = new Set(
		results
			.filter(isRetryableAPNsTransportFailure)
			.map((result) => result.deviceId),
	);
	if (retryableDeviceIds.size === 0) return results;

	const retryResults = new Map<string, APNsResult>();
	for (const device of devices) {
		if (!retryableDeviceIds.has(device.id)) continue;
		const result = await retryTransportFailure({
			device,
			environment,
			payload,
			configuration,
			token,
			collapseId,
			pushType,
			topic,
			priority,
		});
		retryResults.set(device.id, result);
	}

	return results.map(
		(result) => retryResults.get(result.deviceId) || result,
	);
}

export async function sendAPNsNotification({
	devices,
	payload,
	collapseId,
}: {
	devices: APNsDevice[];
	payload: APNsPayload;
	collapseId?: string;
}) {
	const encodedPayload = Buffer.from(JSON.stringify(payload));
	if (encodedPayload.byteLength > 4_096) {
		throw new Error("APNs payload exceeds 4 KB");
	}

	const development = devices.filter(
		(device) => device.environment === "development",
	);
	const production = devices.filter(
		(device) => device.environment === "production",
	);
	const [developmentResults, productionResults] = await Promise.all([
		sendEnvironmentBatch({
			devices: development,
			environment: "development",
			payload: encodedPayload,
			collapseId,
			pushType: "alert",
			priority: "10",
		}),
		sendEnvironmentBatch({
			devices: production,
			environment: "production",
			payload: encodedPayload,
			collapseId,
			pushType: "alert",
			priority: "10",
		}),
	]);
	return [...developmentResults, ...productionResults];
}

export async function sendAPNsLiveActivity({
	devices,
	payload,
	priority = "10",
}: {
	devices: APNsDevice[];
	payload: APNsLiveActivityPayload;
	priority?: "5" | "10";
}) {
	const encodedPayload = Buffer.from(JSON.stringify(payload));
	if (encodedPayload.byteLength > 4_096) {
		throw new Error("Live Activity payload exceeds 4 KB");
	}

	const development = devices.filter(
		(device) => device.environment === "development",
	);
	const production = devices.filter(
		(device) => device.environment === "production",
	);
	const [developmentResults, productionResults] = await Promise.all([
		sendEnvironmentBatch({
			devices: development,
			environment: "development",
			payload: encodedPayload,
			pushType: "liveactivity",
			topicSuffix: ".push-type.liveactivity",
			priority,
		}),
		sendEnvironmentBatch({
			devices: production,
			environment: "production",
			payload: encodedPayload,
			pushType: "liveactivity",
			topicSuffix: ".push-type.liveactivity",
			priority,
		}),
	]);
	return [...developmentResults, ...productionResults];
}
