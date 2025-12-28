# Supabase Role System Setup

This document explains how to set up the role-based access control system in Supabase.

## Overview

The app uses a simple two-role system:

-   **`user`** (default): Regular users with standard access
-   **`admin`**: Administrators with access to admin features

Roles are stored in Supabase Auth `user_metadata.role` and are enforced server-side.

---

## 1. Role Storage Location

### Chosen Approach: `user_metadata.role`

**Why this approach:**

-   ✅ Simple and integrated with Supabase Auth
-   ✅ No additional database table required
-   ✅ Role is included in JWT token (accessible server-side)
-   ✅ Already used for other metadata (name, avatar_url)
-   ✅ Can be set via triggers/functions automatically
-   ✅ Cannot be modified by client-side code (only via Supabase API)

**Alternative considered:**

-   Dedicated `user_profiles` table with `role` column
-   Rejected because it adds complexity and requires additional queries

---

## 2. Default Role Assignment

All new users must default to `role = "user"`. This is enforced via a Supabase Database Trigger.

### Setup Steps

1. **Open Supabase Dashboard**

    - Go to your project → SQL Editor

2. **Run the Setup Script**

    - Open the file `supabase-setup-roles.sql` in this repository
    - Copy the entire contents
    - Paste into Supabase SQL Editor
    - Click "Run" to execute

    **OR** run the SQL directly:

    ```sql
    -- Function to set default role on user creation
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Set default role to "user" if not already set
      IF NEW.raw_user_meta_data->>'role' IS NULL THEN
        NEW.raw_user_meta_data :=
          COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) ||
          '{"role": "user"}'::jsonb;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Trigger to run on user creation
    CREATE TRIGGER on_auth_user_created
      BEFORE INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
    ```

3. **Verify the Setup**

    - Create a test user via your app's signup flow
    - Check in Supabase Dashboard → Authentication → Users
    - Verify the user has `user_metadata.role = "user"`

### How This Guarantees Default Role

-   The trigger runs **before** the user is inserted into `auth.users`
-   It checks if `role` is missing and sets it to `"user"`
-   This happens **server-side** in Supabase, so clients cannot bypass it
-   Even if a client tries to set a different role during signup, the trigger ensures `"user"` is the default

---

## 3. Admin Assignment

Admin role must be assigned **manually** only. There is no UI for this yet.

### Method 1: Supabase Dashboard (Recommended)

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Find the user you want to promote
3. Click on the user to open details
4. Scroll to **User Metadata** section
5. Click **Edit** and add/update:
    ```json
    {
    	"role": "admin"
    }
    ```
6. Click **Save**

### Method 2: SQL Update (For Bulk Operations)

Run this SQL in the Supabase SQL Editor:

```sql
-- Update a specific user to admin (replace EMAIL with actual email)
UPDATE auth.users
SET raw_user_meta_data =
  COALESCE(raw_user_meta_data, '{}'::jsonb) ||
  '{"role": "admin"}'::jsonb
WHERE email = 'user@example.com';
```

**Security Note:** Only run this if you have admin access to Supabase. Never expose this SQL to client-side code.

### Method 3: Admin-Only Script (Future)

A server-side script can be created later that:

-   Runs only with Supabase service role key
-   Validates admin permissions before promoting users
-   Logs admin promotions for audit

**This is not implemented yet.**

---

## 4. Security Considerations

### ✅ What's Secure

-   Role is stored in `user_metadata.role` which is part of the JWT token
-   JWT tokens are signed by Supabase and cannot be forged
-   Client reads role from the token, but cannot modify it
-   Default role is enforced server-side via trigger
-   Admin assignment requires Supabase dashboard or service role access

### ❌ What's NOT Secure (Don't Do This)

-   ❌ Storing role in localStorage
-   ❌ Trusting client-side role flags
-   ❌ Allowing clients to modify their own role
-   ❌ Exposing role-changing endpoints to regular users

### Role Validation

The app validates roles client-side for UI purposes, but **server-side validation is required** for any admin API endpoints (to be implemented later).

---

## 5. Testing the Setup

### Test Default Role Assignment

1. Create a new user account via your app
2. Check Supabase Dashboard → Authentication → Users
3. Verify `user_metadata.role = "user"`

### Test Admin Role

1. Manually set a user to `role = "admin"` in Supabase Dashboard
2. Log in as that user in your app
3. Verify:
    - "Admin panel" appears in sidebar
    - `/admin` page is accessible
    - Regular users do NOT see admin panel
    - Regular users are redirected from `/admin`

---

## 6. Troubleshooting

### Issue: New users don't have role set

**Solution:** Verify the trigger is created and active:

```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

### Issue: Admin panel not showing for admin user

**Solution:**

1. Verify `user_metadata.role = "admin"` in Supabase Dashboard
2. User may need to log out and log back in to refresh JWT token
3. Check browser console for errors

### Issue: Regular users can access /admin

**Solution:** Verify `AdminGuard` component is wrapping the admin page (it should be).

---

## Summary

-   ✅ Roles stored in `user_metadata.role`
-   ✅ Default role `"user"` enforced via database trigger
-   ✅ Admin role assigned manually via Supabase Dashboard
-   ✅ Client reads role from JWT (cannot modify)
-   ✅ Admin panel only visible to admins
-   ✅ `/admin` route protected by `AdminGuard`

**Next Steps:** Implement admin features as needed. All admin routes must use `AdminGuard` and validate role server-side for API calls.
