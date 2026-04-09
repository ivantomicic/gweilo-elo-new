import "server-only";

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { VideoRallySegment } from "@/lib/video-processing/shared";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";

type GeminiFile = {
	name: string;
	uri: string;
	mimeType?: string;
	state?: string;
};

type GeminiFileResponse = {
	file?: GeminiFile;
};

type GeminiGenerateContentResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
	promptFeedback?: {
		blockReason?: string;
	};
};

type AnalyzeRalliesResult = {
	segments: Array<{
		startSeconds: number;
		endSeconds: number;
		confidence?: number | null;
	}>;
};

export async function analyzeVideoRalliesWithGemini(options: {
	filePath: string;
	mimeType: string;
	notes?: string | null;
}) {
	const apiKey = getGeminiApiKey();
	const uploadedFile = await uploadFileToGemini({
		apiKey,
		filePath: options.filePath,
		mimeType: options.mimeType,
	});

	try {
		const activeFile = await waitForGeminiFileToBecomeActive({
			apiKey,
			name: uploadedFile.name,
		});

		const payload = {
			contents: [
				{
					role: "user",
					parts: [
						{
							file_data: {
								mime_type: options.mimeType,
								file_uri: activeFile.uri,
							},
						},
						{
							text: buildRallyPrompt(options.notes),
						},
					],
				},
			],
				generationConfig: {
					temperature: 0.1,
					maxOutputTokens: 8192,
					responseMimeType: "application/json",
					responseJsonSchema: {
						type: "object",
					properties: {
						segments: {
							type: "array",
							description:
								"Ordered list of rally intervals that should stay in the final highlight video.",
							items: {
								type: "object",
								properties: {
									startSeconds: {
										type: "number",
										description:
											"Start timestamp in seconds where the rally should begin in the output.",
									},
									endSeconds: {
										type: "number",
										description:
											"End timestamp in seconds where the rally should stop in the output.",
									},
									confidence: {
										type: ["number", "null"],
										description:
											"Confidence from 0 to 1. Use null only if confidence is impossible to estimate.",
									},
								},
								required: [
									"startSeconds",
									"endSeconds",
									"confidence",
								],
								additionalProperties: false,
							},
						},
					},
					required: ["segments"],
					additionalProperties: false,
				},
			},
		};

		const response = await fetch(
			`${GEMINI_API_BASE_URL}/v1beta/models/gemini-2.5-flash:generateContent`,
			{
				method: "POST",
				headers: {
					"x-goog-api-key": apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			},
		);

		if (!response.ok) {
			const details = await response.text();
			throw new Error(
				`Gemini video analysis failed (${response.status}): ${details}`,
			);
		}

		const data =
			(await response.json()) as GeminiGenerateContentResponse;
		const responseText =
			data.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;

		if (!responseText) {
			const blockReason = data.promptFeedback?.blockReason;
			throw new Error(
				blockReason
					? `Gemini blocked the request: ${blockReason}`
					: "Gemini returned an empty response for video analysis.",
				);
		}

		return parseGeminiSegmentsResponse(responseText);
	} finally {
		await deleteGeminiFile({
			apiKey,
			name: uploadedFile.name,
		});
	}
}

function getGeminiApiKey() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error("GEMINI_API_KEY is not configured on the server.");
	}

	return apiKey;
}

async function uploadFileToGemini(options: {
	apiKey: string;
	filePath: string;
	mimeType: string;
}) {
	const fileBuffer = await readFile(options.filePath);
	const startResponse = await fetch(
		`${GEMINI_API_BASE_URL}/upload/v1beta/files`,
		{
			method: "POST",
			headers: {
				"x-goog-api-key": options.apiKey,
				"X-Goog-Upload-Protocol": "resumable",
				"X-Goog-Upload-Command": "start",
				"X-Goog-Upload-Header-Content-Length": String(fileBuffer.length),
				"X-Goog-Upload-Header-Content-Type": options.mimeType,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				file: {
					display_name: basename(options.filePath),
				},
			}),
		},
	);

	if (!startResponse.ok) {
		const details = await startResponse.text();
		throw new Error(
			`Gemini file upload init failed (${startResponse.status}): ${details}`,
		);
	}

	const uploadUrl = startResponse.headers.get("x-goog-upload-url");
	if (!uploadUrl) {
		throw new Error("Gemini file upload did not return an upload URL.");
	}

	const uploadResponse = await fetch(uploadUrl, {
		method: "POST",
		headers: {
			"Content-Length": String(fileBuffer.length),
			"X-Goog-Upload-Offset": "0",
			"X-Goog-Upload-Command": "upload, finalize",
		},
		body: fileBuffer,
	});

	if (!uploadResponse.ok) {
		const details = await uploadResponse.text();
		throw new Error(
			`Gemini file upload finalize failed (${uploadResponse.status}): ${details}`,
		);
	}

	const data = (await uploadResponse.json()) as GeminiFileResponse;
	const file = extractGeminiFile(data);
	if (!file?.name || !file.uri) {
		throw new Error(
			`Gemini file upload returned incomplete file metadata: ${safeJsonStringify(
				data,
			)}`,
		);
	}

	return file;
}

async function waitForGeminiFileToBecomeActive(options: {
	apiKey: string;
	name: string;
}) {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const currentFile = await getGeminiFile(options);

		if (currentFile.state === "ACTIVE" || !currentFile.state) {
			return currentFile;
		}

		if (currentFile.state === "FAILED") {
			throw new Error("Gemini failed to process the uploaded file.");
		}

		await sleep(2000);
	}

	throw new Error("Timed out while waiting for Gemini to process the file.");
}

async function getGeminiFile(options: { apiKey: string; name: string }) {
	const response = await fetch(
		`${GEMINI_API_BASE_URL}/v1beta/${options.name}`,
		{
			headers: {
				"x-goog-api-key": options.apiKey,
			},
		},
	);

	if (!response.ok) {
		const details = await response.text();
		throw new Error(
			`Failed to fetch Gemini file state (${response.status}): ${details}`,
		);
	}

	const data = (await response.json()) as GeminiFileResponse | GeminiFile;
	const file = extractGeminiFile(data);
	if (!file?.name || !file.uri) {
		throw new Error(
			`Gemini file state response was incomplete: ${safeJsonStringify(data)}`,
		);
	}

	return file;
}

async function deleteGeminiFile(options: { apiKey: string; name: string }) {
	const response = await fetch(
		`${GEMINI_API_BASE_URL}/v1beta/${options.name}`,
		{
			method: "DELETE",
			headers: {
				"x-goog-api-key": options.apiKey,
			},
		},
	);

	if (!response.ok) {
		const details = await response.text();
		console.error(
			`Failed to delete Gemini file ${options.name}:`,
			details || response.statusText,
		);
	}
}

function buildRallyPrompt(notes?: string | null) {
	return [
		"You are segmenting a full table tennis match into every live point.",
		"This is not a highlights task. Do not select only the best rallies. Return every single point you can see, including short points, service winners, missed returns, net or edge points, and service faults that immediately end the point.",
		"A point starts when the server begins the service motion or toss, or just before the first service contact if the toss is not visible.",
		"A point ends immediately when the ball is dead: second bounce, ball off the table, net fault that ends the point, clear miss, or any moment both players stop playing because the point is over.",
		"Exclude all downtime between points: waiting, ball pickup, walking, score pauses, conversations, resets, celebration, and dead time after the point is over.",
		"Missing a point is worse than including a few extra frames. Be recall-oriented, but keep cuts tight around the actual point.",
		"Return segments in ascending order and do not overlap them.",
		"Do not include explanations, transcripts, notes, markdown fences, or any fields besides startSeconds, endSeconds, and confidence.",
		notes?.trim()
			? `Extra operator notes for this upload: ${notes.trim()}`
			: null,
	]
		.filter(Boolean)
		.join("\n");
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGeminiFile(
	payload: GeminiFileResponse | GeminiFile,
): GeminiFile | null {
	if (isGeminiFile(payload)) {
		return payload;
	}

	if (
		payload &&
		typeof payload === "object" &&
		"file" in payload &&
		isGeminiFile(payload.file)
	) {
		return payload.file;
	}

	return null;
}

function isGeminiFile(value: unknown): value is GeminiFile {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.name === "string" &&
		typeof candidate.uri === "string"
	);
}

function safeJsonStringify(value: unknown) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseGeminiSegmentsResponse(responseText: string) {
	const normalizedText = stripCodeFences(responseText).trim();

	try {
		const parsed = JSON.parse(normalizedText) as AnalyzeRalliesResult;
		return normalizeGeminiSegments(parsed);
	} catch (parseError) {
		const extractedSegments = extractSegmentsFromMalformedJson(normalizedText);
		if (extractedSegments.length > 0) {
			console.warn(
				"[video-processing] Gemini returned malformed JSON, recovered segments with fallback parser.",
			);
			return extractedSegments;
		}

		throw new Error(
			`Gemini returned invalid JSON: ${
				parseError instanceof Error ? parseError.message : String(parseError)
			}`,
		);
	}
}

function normalizeGeminiSegments(parsed: AnalyzeRalliesResult) {
	if (!Array.isArray(parsed.segments)) {
		throw new Error("Gemini response did not contain a segments array.");
	}

	return parsed.segments.flatMap((segment) => {
		if (!segment || typeof segment !== "object") {
			return [];
		}

		const startSeconds = Number(segment.startSeconds);
		const endSeconds = Number(segment.endSeconds);
		const confidence =
			typeof segment.confidence === "number" ? segment.confidence : null;

		if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
			return [];
		}

		return [
			{
				startSeconds,
				endSeconds,
				confidence,
				reason: null,
			} satisfies VideoRallySegment,
		];
	});
}

function extractSegmentsFromMalformedJson(responseText: string) {
	const pattern =
		/"startSeconds"\s*:\s*([-+]?\d*\.?\d+)\s*,\s*"endSeconds"\s*:\s*([-+]?\d*\.?\d+)(?:\s*,\s*"confidence"\s*:\s*(null|[-+]?\d*\.?\d+))?/g;
	const recoveredSegments: VideoRallySegment[] = [];

	for (const match of responseText.matchAll(pattern)) {
		const startSeconds = Number(match[1]);
		const endSeconds = Number(match[2]);
		const confidence =
			match[3] && match[3] !== "null" ? Number(match[3]) : null;

		if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
			continue;
		}

		recoveredSegments.push({
			startSeconds,
			endSeconds,
			confidence,
			reason: null,
		});
	}

	return recoveredSegments;
}

function stripCodeFences(value: string) {
	return value
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/\s*```$/i, "");
}
