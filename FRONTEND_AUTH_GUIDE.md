# Frontend Authentication Guide

## Overview

The EKKO frontend now supports Supabase email/password authentication with automatic user synchronization to the `public.users` table.

## Setup

### Environment Variables

Ensure your `.env.local` file contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Getting Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Authentication Pages

### Sign Up
- **URL**: `http://localhost:3004/auth/signup`
- **Features**: 
  - Email/password registration
  - Automatic user sync to `public.users` table
  - Default role: ARTIST

### Sign In
- **URL**: `http://localhost:3004/auth/signin`
- **Features**:
  - Email/password authentication
  - Session persistence
  - Automatic user sync on first login

## Access Token Location

### Browser DevTools

The Supabase access token is stored in browser storage and can be found in:

1. **Chrome/Edge DevTools**:
   - Open DevTools (F12 or Cmd+Option+I)
   - Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
   - Expand **Local Storage**
   - Click on your site's domain (e.g., `http://localhost:3004`)
   - Look for key: `sb-<project-ref>-auth-token`
   - The value is a JSON object containing:
     ```json
     {
       "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "refresh_token": "...",
       "expires_at": 1234567890,
       ...
     }
     ```

2. **Firefox DevTools**:
   - Open DevTools (F12)
   - Go to **Storage** tab
   - Expand **Local Storage** → your domain
   - Find the same key: `sb-<project-ref>-auth-token`

3. **Alternative: Console Method**:
   ```javascript
   // In browser console (after signing in)
   const storage = localStorage.getItem('sb-<project-ref>-auth-token');
   const token = JSON.parse(storage).access_token;
   console.log(token);
   ```

### Programmatic Access

You can also access the token programmatically in client components:

```typescript
import { supabase } from "@/lib/supabase/client";

// Get current session
const { data: { session } } = await supabase.auth.getSession();
const accessToken = session?.access_token;
```

## Testing POST /api/campaigns with Authorization

### Method 1: Using Browser DevTools

1. **Sign in** to the application at `http://localhost:3004/auth/signin`
2. **Open DevTools** (F12)
3. **Extract the access token** from Local Storage (see above)
4. **Use curl** with the token:

```bash
curl -X POST "http://localhost:3004/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -d '{"title": "Test Campaign", "budgetCents": 50000}'
```

### Method 2: Using Browser Console

1. **Sign in** to the application
2. **Open browser console** (F12 → Console tab)
3. **Run this script**:

```javascript
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: 'Test Campaign',
      budgetCents: 50000
    })
  });
  
  const result = await response.json();
  console.log('Response:', result);
})();
```

### Method 3: Using a REST Client

1. **Sign in** and extract the access token
2. **Use Postman, Insomnia, or similar**:
   - Method: POST
   - URL: `http://localhost:3004/api/campaigns`
   - Headers:
     - `Content-Type: application/json`
     - `Authorization: Bearer <your-access-token>`
   - Body:
     ```json
     {
       "title": "Test Campaign",
       "budgetCents": 50000
     }
     ```

## User Synchronization

On first successful login or signup:

1. The frontend calls `/api/auth/sync-user` with the access token
2. The endpoint verifies the token and ensures a user exists in `public.users`
3. If no ARTIST user exists, one is created with role `ARTIST`
4. The user ID is returned (can be used for `DEV_ARTIST_ID` env var)

## Session Persistence

- Sessions are automatically persisted in browser Local Storage
- Tokens are automatically refreshed when they expire
- Sessions persist across page refreshes and browser restarts
- Sign out clears the session from storage

## Example Flow

1. User visits `http://localhost:3004`
2. If not signed in, sees links to Sign In / Sign Up
3. User clicks "Sign Up" → `/auth/signup`
4. User enters email/password and submits
5. Supabase creates auth user
6. Frontend calls `/api/auth/sync-user` to ensure app user exists
7. Session is stored in Local Storage
8. User is redirected to home page
9. Access token is now available for API calls

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`
- Restart the dev server after adding env vars

### "Unauthorized" when calling API
- Verify the access token is valid (not expired)
- Check that the token is correctly formatted: `Bearer <token>`
- Ensure you're signed in and the session is active

### Token not found in Local Storage
- Clear browser cache and sign in again
- Check that you're looking at the correct domain in DevTools
- Verify Supabase client is configured correctly

