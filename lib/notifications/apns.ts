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

function sendOnConnection({
	client,
	device,
	payload,
	configuration,
	token,
	collapseId,
}: {
	client: ClientHttp2Session;
	device: APNsDevice;
	payload: Buffer;
	configuration: APNsConfiguration;
	token: string;
	collapseId?: string;
}) {
	return new Promise<APNsResult>((resolve) => {
		const apnsId = randomUUID();
		const request = client.request({
			":method": "POST",
			":path": `/3/device/${device.token}`,
			authorization: `bearer ${token}`,
			"apns-topic": configuration.bundleId,
			"apns-push-type": "alert",
			"apns-priority": "10",
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

async function sendEnvironmentBatch({
	devices,
	environment,
	payload,
	collapseId,
}: {
	devices: APNsDevice[];
	environment: APNsEnvironment;
	payload: Buffer;
	collapseId?: string;
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

	const client = connect(endpoint(environment));
	const token = providerToken(configuration);
	const connectionError = new Promise<never>((_, reject) => {
		client.once("error", reject);
	});

	try {
		return await Promise.race([
			Promise.all(
				devices.map((device) =>
					sendOnConnection({
						client,
						device,
						payload,
						configuration,
						token,
						collapseId,
					}),
				),
			),
			connectionError,
		]);
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "APNs connection failed";
		return devices.map((device) => ({
			deviceId: device.id,
			apnsId: randomUUID(),
			status: 0,
			reason,
			succeeded: false,
			shouldInvalidateToken: false,
		}));
	} finally {
		client.close();
	}
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
		}),
		sendEnvironmentBatch({
			devices: production,
			environment: "production",
			payload: encodedPayload,
			collapseId,
		}),
	]);
	return [...developmentResults, ...productionResults];
}
