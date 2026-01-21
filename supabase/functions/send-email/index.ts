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

interface TestEmailProps {
	title: string;
	message: string;
	ctaLabel?: string;
	logoUrl?: string;
	pollQuestion?: string;
	pollDescription?: string;
	pollOptions?: Array<{ id: string; text: string }>;
	platformUrl?: string;
	pollId?: string;
	userId?: string; // User ID for auto-submit links
}

/**
 * Renders a test email template with dark theme
 * Supports both simple test emails and poll notification emails
 */
function renderTestEmail(props: TestEmailProps): string {
	const { 
		title, 
		message, 
		ctaLabel, 
		logoUrl = "https://yourdomain.com/logo.png",
		pollQuestion,
		pollDescription,
		pollOptions = [],
		platformUrl = "https://yourdomain.com/polls",
		pollId,
		userId,
	} = props;

	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<title>${escapeHtml(title)}</title>
	<!--[if mso]>
	<style type="text/css">
		table { border-collapse: collapse; }
	</style>
	<![endif]-->
	<style type="text/css">
		/* Reset styles */
		body, table, td, p, a, li, blockquote {
			-webkit-text-size-adjust: 100%;
			-ms-text-size-adjust: 100%;
		}
		table, td {
			mso-table-lspace: 0pt;
			mso-table-rspace: 0pt;
		}
		img {
			-ms-interpolation-mode: bicubic;
			border: 0;
			height: auto;
			line-height: 100%;
			outline: none;
			text-decoration: none;
		}
		/* Mobile styles */
		@media only screen and (max-width: 600px) {
			.email-container {
				width: 100% !important;
				max-width: 100% !important;
			}
			.email-content {
				padding: 0 10px 20px 10px !important;
			}
			.email-header {
				padding: 0 0 20px 0 !important;
			}
			.email-footer {
				padding: 20px 10px !important;
			}
			.email-title {
				font-size: 20px !important;
			}
			.email-message {
				font-size: 15px !important;
			}
			.poll-section {
				padding: 20px !important;
				margin: 0 !important;
			}
			.poll-question {
				font-size: 18px !important;
			}
			.poll-description {
				font-size: 13px !important;
			}
			.poll-button {
				padding: 12px 16px !important;
				font-size: 14px !important;
			}
			.logo-img {
				width: 200px !important;
				max-width: 33% !important;
				height: auto !important;
			}
		}
	</style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0A0A0A; width: 100%;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<!--[if mso]>
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600">
				<tr>
				<td>
				<![endif]-->
				<!-- Logo -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; margin: 0 auto;">
					<tr>
						<td align="center" class="email-header" style="padding: 0 0 30px 0;">
							<img src="${logoUrl}" alt="Gweilo Elo" class="logo-img" width="275" height="275" style="display: block; width: 275px; max-width: 33%; height: auto;" />
						</td>
					</tr>
				</table>
				
				<!-- Title and Message -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; margin: 0 auto;">
					<tr>
						<td class="email-content" style="padding: 0 20px 30px 20px;">
							<h1 class="email-title" style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; line-height: 1.3; color: #FFFFFF; text-align: center;">
								${escapeHtml(title)}
							</h1>
							<p class="email-message" style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #E5E5E5; text-align: center;">
								${escapeHtml(message).replace(/\n/g, '<br>')}
							</p>
						</td>
					</tr>
				</table>
				
				${pollQuestion ? `
				<!-- Poll Section (only wrapper) -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; margin: 0 auto;">
					<tr>
						<td class="email-content" style="padding: 0 20px;">
							<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="poll-section" style="margin: 0; padding: 24px; background-color: #1A1B23; border-radius: 8px; width: 100%;">
								<tr>
									<td>
										<h2 class="poll-question" style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; line-height: 1.3; color: #FFFFFF;">
											${escapeHtml(pollQuestion)}
										</h2>
										${pollDescription ? `
										<p class="poll-description" style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #9CA3AF;">
											${escapeHtml(pollDescription).replace(/\n/g, '<br>')}
										</p>
										` : ''}
										
										<!-- Poll Options -->
										<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 20px; width: 100%;">
											${pollOptions.map((option, index) => {
												// Build URL with poll ID, option ID, and user ID for auto-submit
												// Format: /polls/answer?pollId=xxx&optionId=yyy&userId=zzz
												let optionUrl = platformUrl;
												if (pollId && option.id) {
													const params = new URLSearchParams({
														pollId: pollId,
														optionId: option.id,
													});
													if (userId) {
														params.append('userId', userId);
													}
													optionUrl = `${platformUrl}/answer?${params.toString()}`;
												}
												return `
											<tr>
												<td style="padding-bottom: 12px;">
													<a href="${optionUrl}" class="poll-button" style="display: block; padding: 14px 20px; background-color: #3B82F6; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500; text-align: center; width: 100%; box-sizing: border-box;">
														${escapeHtml(option.text)}
													</a>
												</td>
											</tr>
											`;
											}).join('')}
										</table>
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
				` : ''}
				
				${!pollQuestion && ctaLabel ? `
				<!-- Simple CTA Button -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; margin: 0 auto;">
					<tr>
						<td class="email-content" style="padding: 0 20px;">
							<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
								<tr>
									<td align="center" style="padding: 0;">
										<a href="${platformUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">
											${escapeHtml(ctaLabel)}
										</a>
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
				` : ''}
				
				<!-- Footer -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; margin: 30px auto 0 auto;">
					<tr>
						<td class="email-footer" style="padding: 30px 20px;">
							<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9CA3AF; text-align: center;">
								Ukoliko više ne želite da primate ove mejlove 🖕
							</p>
						</td>
					</tr>
				</table>
				<!--[if mso]>
				</td>
				</tr>
				</table>
				<![endif]-->
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();

	return html;
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

// CORS headers helper
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: corsHeaders,
		});
	}

	// Only allow POST requests
	if (req.method !== "POST") {
		return new Response(
			JSON.stringify({ error: "Method not allowed. Use POST." }),
			{
				status: 405,
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders,
				},
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
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders,
					},
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
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders,
					},
				}
			);
		}

		// Get from email address (configurable via secret, with fallback)
		const fromEmailRaw = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
		// Format: "Randy Daytona <email@domain.com>"
		const fromEmail = fromEmailRaw.includes('<') 
			? fromEmailRaw 
			: `Randy Daytona <${fromEmailRaw}>`;

		// Get platform URL from secrets (for poll links and logo)
		const platformUrl = Deno.env.get("PLATFORM_URL") || "https://yourdomain.com";
		
		// Get logo URL from secrets, or construct from platform URL
		// Logo should be accessible at {platformUrl}/logo.png
		const logoUrlFromSecret = Deno.env.get("EMAIL_LOGO_URL");
		const logoUrl = logoUrlFromSecret || `${platformUrl}/logo.png`;

		let emailSubject: string;
		let emailHtml: string | undefined;
		let emailText: string;

		// Handle different email types
		if (body.type === "test") {
			// Render test email template
			const payload = body.payload || {};
			const title = (payload.title as string) || "Email system test";
			const message = (payload.message as string) || "Email sending via Supabase Edge Functions works.";
			const ctaLabel = payload.ctaLabel as string | undefined;
			
			// Poll-specific fields (for poll notification emails)
			const pollQuestion = payload.pollQuestion as string | undefined;
			const pollDescription = payload.pollDescription as string | undefined;
			const pollOptions = (payload.pollOptions as Array<{ id: string; text: string }>) || [];

			emailSubject = title;
			// Construct full platform URL for polls page
			const pollsUrl = platformUrl.endsWith('/polls') ? platformUrl : `${platformUrl}/polls`;
			
			emailHtml = renderTestEmail({
				title,
				message,
				ctaLabel,
				logoUrl,
				pollQuestion,
				pollDescription,
				pollOptions,
				platformUrl: pollsUrl,
			});
			
			// Plain text version
			let textContent = `${title}\n\n${message}`;
			if (pollQuestion) {
				textContent += `\n\n${pollQuestion}`;
				if (pollDescription) {
					textContent += `\n${pollDescription}`;
				}
				if (pollOptions.length > 0) {
					textContent += `\n\nOpcije:\n${pollOptions.map((opt, i) => `${i + 1}. ${opt.text}`).join('\n')}`;
					textContent += `\n\nOdgovori ovde: ${pollsUrl}`;
				}
			} else if (ctaLabel) {
				textContent += `\n\n${ctaLabel}: ${pollsUrl}`;
			}
			emailText = textContent;
		} else if (body.type === "poll_created") {
			// Poll created notification email
			const payload = body.payload || {};
			const pollQuestion = (payload.question as string) || "Nova anketa";
			const pollDescription = payload.description as string | undefined;
			const pollId = payload.pollId as string | undefined;
			const userId = payload.userId as string | undefined; // User ID for auto-submit
			
			// Options can be either array of strings (legacy) or array of {id, text} objects
			const rawOptions = payload.options as (string[] | Array<{ id: string; text: string }>) || [];
			const formattedOptions = rawOptions.map((opt, index) => {
				if (typeof opt === 'string') {
					// Legacy format: just text
					return { id: `opt-${index}`, text: opt };
				} else {
					// New format: { id, text }
					return { id: opt.id, text: opt.text };
				}
			});

			// Email content
			const title = "Nova anketa je dostupna";
			const message = "Imamo novu anketu za vas! Kliknite na opciju ispod da glasate.";

			// Construct full platform URL for polls page
			const pollsUrl = platformUrl.endsWith('/polls') ? platformUrl : `${platformUrl}/polls`;

			// Email subject includes poll question
			emailSubject = `Nova anketa: ${pollQuestion}`;
			emailHtml = renderTestEmail({
				title,
				message,
				logoUrl,
				pollQuestion,
				pollDescription,
				pollOptions: formattedOptions,
				platformUrl: pollsUrl,
				pollId,
				userId, // Pass userId to template for links
			});

			// Plain text version
			let textContent = `${title}\n\n${message}\n\n${pollQuestion}`;
			if (pollDescription) {
				textContent += `\n${pollDescription}`;
			}
			if (formattedOptions.length > 0) {
				textContent += `\n\nOpcije:\n${formattedOptions.map((opt, i) => {
					let optionUrl = pollsUrl;
					if (pollId && opt.id) {
						const params = new URLSearchParams({
							pollId: pollId,
							optionId: opt.id,
						});
						if (userId) {
							params.append('userId', userId);
						}
						optionUrl = `${pollsUrl}/answer?${params.toString()}`;
					}
					return `${i + 1}. ${opt.text} - ${optionUrl}`;
				}).join('\n')}`;
				textContent += `\n\nIli odgovori ovde: ${pollsUrl}`;
			}
			emailText = textContent;
		} else {
			// Default fallback for other types or no type
			emailSubject = "Email system test";
			emailText = "Email sending via Supabase Edge Functions works.";
		}

		// Prepare email payload
		const emailPayload: {
			from: string;
			to: string[];
			subject: string;
			text: string;
			html?: string;
		} = {
			from: fromEmail,
			to: [body.to],
			subject: emailSubject,
			text: emailText,
		};

		// Add HTML if available
		if (emailHtml) {
			emailPayload.html = emailHtml;
		}

		// Send email via Resend REST API
		const resendResponse = await fetch(RESEND_API_URL, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(emailPayload),
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
					headers: { 
						"Content-Type": "application/json",
						...corsHeaders,
					},
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
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders,
				},
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
				headers: { 
					"Content-Type": "application/json",
					...corsHeaders,
				},
			}
		);
	}
});
