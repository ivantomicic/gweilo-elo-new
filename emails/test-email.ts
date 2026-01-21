// Email template for test emails
// Dark theme, modern SaaS style
// Works with Deno (no React/JSX dependencies)

interface TestEmailProps {
	title: string;
	message: string;
	ctaLabel?: string;
	logoUrl?: string;
}

/**
 * Renders a test email template with dark theme
 * 
 * @param props - Email template props
 * @returns HTML string for the email
 */
export function renderTestEmail(props: TestEmailProps): string {
	const { title, message, ctaLabel, logoUrl = "https://yourdomain.com/logo.png" } = props;

	// Inline CSS for email compatibility (most email clients don't support external stylesheets)
	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF;">
	<!-- Email wrapper -->
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0A0A0A;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<!-- Email container -->
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #1A1B23; border-radius: 8px; overflow: hidden;">
					<!-- Logo section -->
					<tr>
						<td align="center" style="padding: 40px 40px 30px 40px;">
							<img src="${logoUrl}" alt="Gweilo Elo" width="40" height="40" style="display: block; width: 40px; height: 40px;" />
						</td>
					</tr>
					
					<!-- Content section -->
					<tr>
						<td style="padding: 0 40px 40px 40px;">
							<!-- Title -->
							<h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; line-height: 1.3; color: #FFFFFF;">
								${escapeHtml(title)}
							</h1>
							
							<!-- Message -->
							<p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #E5E5E5;">
								${escapeHtml(message).replace(/\n/g, '<br>')}
							</p>
							
							${ctaLabel ? `
							<!-- CTA Button -->
							<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
								<tr>
									<td align="left" style="padding: 0;">
										<a href="#" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">
											${escapeHtml(ctaLabel)}
										</a>
									</td>
								</tr>
							</table>
							` : ''}
						</td>
					</tr>
					
					<!-- Footer -->
					<tr>
						<td style="padding: 30px 40px; border-top: 1px solid #2A2B33;">
							<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9CA3AF; text-align: center;">
								This is a test email from Gweilo Elo
							</p>
						</td>
					</tr>
				</table>
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
