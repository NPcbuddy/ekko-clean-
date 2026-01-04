# Frontend Authentication Implementation Summary

## Files Created

### Client-Side Files
1. **`src/lib/supabase/client.ts`**
   - Supabase client for frontend use
   - Configured with session persistence
   - Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. **`src/app/auth/signin/page.tsx`**
   - Sign in page with email/password form
   - Calls `/api/auth/sync-user` after successful login
   - Redirects to home page on success

3. **`src/app/auth/signup/page.tsx`**
   - Sign up page with email/password form
   - Calls `/api/auth/sync-user` after successful registration
   - Handles email confirmation flow

### Server-Side Files
4. **`src/app/api/auth/sync-user/route.ts`**
   - POST endpoint to sync Supabase auth user to `public.users` table
   - Requires authentication (validates JWT token)
   - Ensures ARTIST user exists in database
   - Returns user ID

### Modified Files
5. **`src/app/page.tsx`**
   - Updated to show auth status
   - Displays sign in/sign up links when not authenticated
   - Shows user email and sign out button when authenticated
   - Checks session on mount and listens for auth changes

## Features Implemented

✅ **Email/Password Authentication**
- Sign up with email and password
- Sign in with email and password
- Session persistence in browser Local Storage

✅ **User Synchronization**
- Automatic sync to `public.users` table on first login/signup
- Creates ARTIST user if none exists
- Uses existing authentication helpers

✅ **Session Management**
- Automatic token refresh
- Session persistence across page refreshes
- Sign out functionality

## Access Token Location

### In Browser DevTools:

1. **Chrome/Edge**:
   - DevTools → Application tab → Local Storage → your domain
   - Key: `sb-<project-ref>-auth-token`
   - Value contains `access_token` field

2. **Firefox**:
   - DevTools → Storage tab → Local Storage → your domain
   - Same key and structure

3. **Console Method**:
   ```javascript
   const storage = localStorage.getItem('sb-<project-ref>-auth-token');
   const token = JSON.parse(storage).access_token;
   ```

## Testing POST /api/campaigns

### Step 1: Sign In
1. Navigate to `http://localhost:3004/auth/signin`
2. Enter email and password
3. Sign in successfully

### Step 2: Extract Access Token
1. Open DevTools (F12)
2. Go to Application/Storage → Local Storage
3. Find `sb-<project-ref>-auth-token`
4. Copy the `access_token` value

### Step 3: Test API Call
```bash
curl -X POST "http://localhost:3004/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-access-token>" \
  -d '{"title": "Test Campaign", "budgetCents": 50000}'
```

### Expected Response:
```json
{
  "campaign": {
    "id": 2,
    "artist_id": 1,
    "title": "Test Campaign",
    "budget_cents": 50000,
    ...
  },
  "paymentIntent": {
    "id": "pi_...",
    "client_secret": "..."
  }
}
```

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## User Flow

1. User visits home page → sees "Sign In" / "Sign Up" links
2. User clicks "Sign Up" → fills form → submits
3. Supabase creates auth user
4. Frontend calls `/api/auth/sync-user` → ensures app user exists
5. Session stored in Local Storage
6. User redirected to home → sees email and "Sign Out" button
7. Access token available for API calls

## Notes

- **No schema changes**: Works with existing `users` table
- **API authorization unchanged**: Still requires valid JWT tokens
- **Session persistence**: Automatic via Supabase client configuration
- **User sync**: Simplified approach - ensures ARTIST user exists (can be enhanced with auth_user_id mapping in future)

## Next Steps (Optional Enhancements)

- Add `auth_user_id` column to `users` table to track Supabase auth user mapping
- Add role selection during signup
- Add email verification flow
- Add password reset functionality
- Add profile page

