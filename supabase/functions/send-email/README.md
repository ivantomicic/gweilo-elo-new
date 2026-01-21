# Send Email Edge Function

Supabase Edge Function for sending emails via Resend API.

## Setup Instructions

### 1. Get Resend API Key

1. Sign up at [resend.com](https://resend.com) (or log in)
2. Go to **API Keys** in the dashboard
3. Create a new API key (or use existing)
4. Copy the API key (starts with `re_...`)

### 2. Set Supabase Secrets

Set the required secrets in your Supabase project:

```bash
# Using Supabase CLI
supabase secrets set RESEND_API_KEY=re_your_api_key_here
supabase secrets set RESEND_FROM_EMAIL=your-email@yourdomain.com
supabase secrets set PLATFORM_URL=https://yourdomain.com
# Optional: Custom logo URL (defaults to {PLATFORM_URL}/logo.png)
supabase secrets set EMAIL_LOGO_URL=https://yourdomain.com/logo.png
```

**Or via Supabase Dashboard:**
1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Add:
   - `RESEND_API_KEY`: Your Resend API key
   - `RESEND_FROM_EMAIL`: Your verified sender email (optional, defaults to `onboarding@resend.dev`)
   - `PLATFORM_URL`: Your app's public URL (e.g., `https://yourdomain.com`) - used for logo and poll links
   - `EMAIL_LOGO_URL`: Custom logo URL (optional, defaults to `{PLATFORM_URL}/logo.png`)

**Note:** 
- For testing, you can use `onboarding@resend.dev` as the from address (Resend's default test sender). For production, you'll need to verify your own domain in Resend.
- The logo will be loaded from `{PLATFORM_URL}/logo.png` by default. Make sure your logo is accessible at that URL.

### 3. Deploy the Edge Function

**Using Supabase CLI:**

```bash
# Make sure you're in the project root
supabase functions deploy send-email
```

**Or via Supabase Dashboard:**
1. Go to **Edge Functions** in your Supabase dashboard
2. Click **Deploy a new function**
3. Upload the `supabase/functions/send-email` directory
4. Or use the CLI method above (recommended)

### 4. Get Your Function URL

After deployment, you'll get a function URL like:
```
https://<project-ref>.supabase.co/functions/v1/send-email
```

You can find this in:
- Supabase Dashboard → **Edge Functions** → `send-email` → **URL**
- Or via CLI: `supabase functions list`

### 5. Get Your Supabase Anon Key

You'll need your Supabase anon key for authentication. Find it in:
- Supabase Dashboard → **Settings** → **API** → **Project API keys** → **anon public**

## Testing the Function

### Using curl

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/send-email \
  -H "Authorization: Bearer <your-supabase-anon-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "type": "test",
    "payload": {}
  }'
```

### Using fetch (JavaScript/TypeScript)

```typescript
const response = await fetch(
  "https://<project-ref>.supabase.co/functions/v1/send-email",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "your-email@example.com",
      type: "test",
      payload: {},
    }),
  }
);

const result = await response.json();
console.log(result);
```

### Expected Response

**Success (200):**
```json
{
  "success": true,
  "messageId": "abc123...",
  "to": "your-email@example.com"
}
```

**Error (400/500):**
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

## Current Behavior

- Accepts POST requests with JSON body containing `to`, `type`, and `payload`
- Currently ignores `type` and `payload` (for future use)
- Sends a simple test email:
  - **Subject:** "Email system test"
  - **Body:** "Email sending via Supabase Edge Functions works."
- Uses Resend REST API (not Node SDK, compatible with Deno)

## Future Enhancements

- Support different email types based on `type` field (e.g., `poll_created`, `session_completed`)
- Use `payload` to render email templates
- Add email template rendering (React Email or similar)
- Add retry logic for failed sends
- Add logging/analytics for email sends

## Troubleshooting

**Error: "Email service configuration error"**
- Check that `RESEND_API_KEY` secret is set correctly
- Verify the secret name is exactly `RESEND_API_KEY`

**Error: "Failed to send email"**
- Check your Resend API key is valid
- Verify the `to` email address is valid
- Check Resend dashboard for API usage limits

**Error: 401 Unauthorized**
- Verify your Supabase anon key is correct
- Check the Authorization header format: `Bearer <key>`

**Function not found (404)**
- Ensure the function is deployed: `supabase functions deploy send-email`
- Check the function URL matches your project reference
