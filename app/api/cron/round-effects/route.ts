import { NextRequest, NextResponse } from "next/server";
import { processPendingRoundEffects } from "@/lib/elo/round-effects";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
	const secret = process.env.CRON_SECRET;
	if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		return NextResponse.json(await processPendingRoundEffects());
	} catch (error) {
		console.error("Round effects worker failed:", error);
		return NextResponse.json({ error: "Round effects worker failed" }, { status: 500 });
	}
}
