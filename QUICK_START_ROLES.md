# Quick Start: Role System Setup

## ✅ Step 1: Run the SQL Script (You've Done This!)

If you've already run `supabase-setup-roles.sql`, great! The trigger is now active.

---

## Step 1.5: Update Existing Users (IMPORTANT!)

**The trigger only works for NEW users.** If you have existing users (created before running the SQL), you need to update them manually.

### Option A: Update All Existing Users at Once (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Run the file `supabase-update-existing-users.sql`
   - This sets `role = "user"` for all existing users who don't have a role
3. Done! All existing users now have the default role

### Option B: Update Just Your User

If you only want to update your own user to admin right away:

1. Go to Supabase Dashboard → SQL Editor
2. Run this (replace with your email):
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = 
     COALESCE(raw_user_meta_data, '{}'::jsonb) || 
     '{"role": "admin"}'::jsonb
   WHERE email = 'your-email@example.com';
   ```

---

## Step 2: Verify the Setup Worked

1. **Check if the trigger exists:**
   - Go to Supabase Dashboard → SQL Editor
   - Run this query:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
   - You should see one row returned (the trigger exists)

2. **Test with a new user:**
   - Create a new user account via your app's signup
   - Go to Supabase Dashboard → Authentication → Users
   - Find the new user and click on them
   - Check the **User Metadata** section
   - You should see: `"role": "user"`

---

## Step 3: Promote Your First Admin User

To see the admin panel in your app, you need to promote at least one user to admin.

### Option A: Via Supabase Dashboard (Easiest)

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Find your user account (the one you want to be admin)
3. Click on the user to open their details
4. Scroll down to **User Metadata** section
5. Click **Edit** (or the pencil icon)
6. You'll see a JSON editor. Add or update the role:
   ```json
   {
     "role": "admin"
   }
   ```
   - If there's already metadata, just add `"role": "admin"` to it
   - Example if you already have name/avatar:
     ```json
     {
       "name": "Your Name",
       "avatar_url": "...",
       "role": "admin"
     }
     ```
7. Click **Save**

### Option B: Via SQL (If you prefer)

1. Go to Supabase Dashboard → SQL Editor
2. Run this (replace `your-email@example.com` with your actual email):
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = 
     COALESCE(raw_user_meta_data, '{}'::jsonb) || 
     '{"role": "admin"}'::jsonb
   WHERE email = 'your-email@example.com';
   ```

---

## Step 4: Test in Your App

1. **Log out** of your app (if you're already logged in)
2. **Log back in** with the user you just promoted to admin
   - Important: You need to log out/in to refresh the JWT token with the new role
3. **Check the sidebar:**
   - You should now see "Admin panel" below "Anketarijum"
   - It should have a shield icon
4. **Click "Admin panel":**
   - You should be able to access `/admin` page
   - The page will be empty for now (that's expected)

### Test Regular Users

1. Log out
2. Create a new test account (or use a different account)
3. Log in with that account
4. **Verify:**
   - "Admin panel" should NOT appear in the sidebar
   - If you try to go to `/admin` directly, you should be redirected to home or see login screen

---

## Troubleshooting

### "Admin panel" not showing after promoting user

**Solution:**
- Make sure you logged out and logged back in (JWT token needs to refresh)
- Verify in Supabase Dashboard that `user_metadata.role = "admin"` for your user
- Check browser console for any errors

### New users don't have role set

**Solution:**
- Verify the trigger exists (see Step 2)
- Check if the trigger is enabled in Supabase Dashboard → Database → Triggers
- Try creating a new user and check their metadata again

### Can't edit user metadata in Supabase Dashboard

**Solution:**
- Make sure you're in the correct project
- Try refreshing the page
- Use the SQL method (Option B) instead

---

## What's Next?

Once you've verified everything works:

- ✅ New users automatically get `role = "user"`
- ✅ You can promote users to admin via Supabase Dashboard
- ✅ Admin panel is visible only to admins
- ✅ `/admin` route is protected

**Future:** You can now build admin features in the `/admin` page. All admin routes should use the `AdminGuard` component for protection.

