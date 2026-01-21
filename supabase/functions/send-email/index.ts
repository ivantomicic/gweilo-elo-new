// Supabase Edge Function: send-email
// Sends emails via Resend REST API
// Deno runtime

const RESEND_API_URL = "https://api.resend.com/emails";

interface EmailRequest {
	to: string;
	type?: string;
	payload?: Record<string, unknown>;
}

interface ResendEmailResponse {
	id: string;
}

Deno.serve(async (req) => {
	// Only allow POST requests
	if (req.method !== "POST") {
		return new Response(
			JSON.stringify({ error: "Method not allowed. Use POST." }),
			{
				status: 405,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	try {
		// Parse request body
		const body: EmailRequest = await req.json();

		// Validate required fields
		if (!body.to || typeof body.to !== "string") {
			return new Response(
				JSON.stringify({ error: "Missing or invalid 'to' email address" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		// Get Resend API key from Supabase secrets
		const resendApiKey = Deno.env.get("RESEND_API_KEY");
		if (!resendApiKey) {
			console.error("[send-email] RESEND_API_KEY secret not found");
			return new Response(
				JSON.stringify({ error: "Email service configuration error" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		// Get from email address (configurable via secret, with fallback)
		const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

		// For now: ignore type and payload, send simple test email
		// TODO: Later, use type and payload to render different email templates
		const emailSubject = "Email system test";
		const emailBody = "Email sending via Supabase Edge Functions works.";

		// Send email via Resend REST API
		const resendResponse = await fetch(RESEND_API_URL, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: fromEmail,
				to: [body.to],
				subject: emailSubject,
				text: emailBody,
			}),
		});

		if (!resendResponse.ok) {
			const errorText = await resendResponse.text();
			console.error("[send-email] Resend API error:", errorText);
			return new Response(
				JSON.stringify({
					error: "Failed to send email",
					details: errorText,
				}),
				{
					status: resendResponse.status,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		const resendData: ResendEmailResponse = await resendResponse.json();

		// Return success response
		return new Response(
			JSON.stringify({
				success: true,
				messageId: resendData.id,
				to: body.to,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		console.error("[send-email] Unexpected error:", error);
		return new Response(
			JSON.stringify({
				error: "Internal server error",
				message: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
});
