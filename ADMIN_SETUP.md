# Admin User Management Setup

This document explains the admin user management feature and required Supabase configuration.

## Overview

The admin panel includes a user management table that allows admins to:
- View all users (avatar, name, email)
- Edit user display names
- Edit user email addresses
- All changes persist in Supabase

## Security Architecture

### How Admins Fetch All Users

**Problem:** Client-side Supabase cannot list all users directly (security restriction).

**Solution:** API route using service role key server-side.

1. **Client** → Calls `/api/admin/users` with JWT token
2. **API Route** → Verifies admin role from JWT token
3. **API Route** → Uses service role key to call Supabase Admin API
4. **Supabase Admin API** → Returns all users (bypasses RLS)
5. **API Route** → Returns formatted user list to client

**Why Service Role Key:**
- Supabase Admin API requires service role key
- Service role key has full access (bypasses RLS)
- Must NEVER be exposed to client
- Only used in server-side API routes

### How Admins Update User Data

**Display Name:**
- Updates `user_metadata.name` in Supabase Auth
- Changes are immediate (no confirmation needed)

**Email:**
- Uses Supabase `admin.updateUserById()` with new email
- Supabase automatically sends confirmation email to new address
- User must confirm new email before it becomes active
- Old email remains active until confirmation

**Avatar:**
- Updates `user_metadata.avatar_url` in Supabase Auth
- Assumes avatar URL is already uploaded to Supabase Storage
- For now, avatar editing is not implemented in the UI (can be added later)

## Required Environment Variables

Add this to your `.env.local` file:

```bash
# Supabase Admin (Service Role Key)
# Get this from: Supabase Dashboard → Settings → API → service_role key
# WARNING: Never expose this to the client. Only use in server-side code.
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find it:**
1. Go to Supabase Dashboard
2. Settings → API
3. Copy the `service_role` key (NOT the `anon` key)
4. Add to `.env.local`

**Security:**
- ✅ This key is only used in API routes (server-side)
- ✅ Never exposed to client code
- ✅ Never committed to git (should be in `.env.local`)

## API Routes

### GET `/api/admin/users`

Fetches all users (admin-only).

**Request:**
```typescript
Headers: {
  Authorization: "Bearer <jwt_token>"
}
```

**Response:**
```typescript
{
  users: [
    {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
      role: "admin" | "user";
      createdAt: string;
    }
  ]
}
```

**Security:**
- Verifies admin role from JWT token
- Returns 401 if not admin
- Uses service role key server-side

### PATCH `/api/admin/users/[userId]`

Updates user data (admin-only).

**Request:**
```typescript
Headers: {
  Authorization: "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
Body: {
  name?: string;
  email?: string;
  avatar?: string | null;
}
```

**Response:**
```typescript
{
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    role: "admin" | "user";
  };
  message: string;
}
```

**Security:**
- Verifies admin role from JWT token
- Returns 401 if not admin
- Uses service role key server-side

## Access Control

### Client-Side Protection

- `AdminGuard` component protects `/admin` route
- Sidebar only shows "Admin panel" link for admins
- User management table component is only rendered in admin page

### Server-Side Protection

- All API routes verify admin role via `verifyAdmin()` helper
- Uses JWT token from Authorization header
- Returns 401 if user is not admin
- Service role key is never exposed to client

## Limitations & Notes

### Email Updates

- Email changes require confirmation
- Supabase sends confirmation email automatically
- Old email remains active until new email is confirmed
- User receives email at new address with confirmation link

### Avatar Updates

- Currently, avatar URL must be provided directly
- Avatar upload functionality not implemented in admin panel yet
- Can be added later if needed

### No Pagination

- All users are loaded at once
- For large user bases (>1000 users), pagination should be added
- Current implementation is sufficient for small to medium user bases

### No Search/Filter

- Table shows all users
- Search/filter can be added later if needed

## Testing

1. **Verify Admin Access:**
   - Log in as admin
   - Navigate to `/admin`
   - Should see user management table

2. **Verify Non-Admin Access:**
   - Log in as regular user
   - Try to access `/admin` directly
   - Should be redirected or see login screen

3. **Test User Updates:**
   - As admin, edit a user's name
   - Save changes
   - Verify changes persist
   - Check Supabase Dashboard to confirm metadata updated

4. **Test Email Update:**
   - As admin, edit a user's email
   - Save changes
   - Verify confirmation email is sent (check Supabase logs or user's inbox)

## Troubleshooting

### "Unauthorized" Error

**Cause:** User is not admin or token is invalid.

**Solution:**
- Verify user has `role = "admin"` in Supabase Dashboard
- Log out and log back in to refresh JWT token
- Check browser console for errors

### "Missing Supabase admin environment variables"

**Cause:** `SUPABASE_SERVICE_ROLE_KEY` not set in `.env.local`.

**Solution:**
- Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
- Restart Next.js dev server
- Verify key is correct (from Supabase Dashboard → Settings → API)

### Users Not Loading

**Cause:** API route error or service role key issue.

**Solution:**
- Check server logs for errors
- Verify service role key is correct
- Check Supabase Dashboard → Logs for API errors
- Verify admin role is set correctly

### Email Update Not Working

**Cause:** Supabase email confirmation flow.

**Solution:**
- Email changes require confirmation
- Check Supabase Dashboard → Authentication → Users
- Verify email change is pending confirmation
- User must click confirmation link in email

## Future Enhancements

- [ ] Avatar upload in admin panel
- [ ] Role editing (promote/demote users)
- [ ] User deletion
- [ ] Search/filter users
- [ ] Pagination for large user lists
- [ ] Bulk actions
- [ ] User activity logs

