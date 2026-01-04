# Authentication & Authorization Implementation Summary

## Files Created/Modified

### New Files
1. **`src/lib/auth.ts`** - Authentication and authorization helpers
   - `getAuthUserId()` - Extracts and verifies Supabase JWT token
   - `getAppUser()` - Maps Supabase auth user to app user record
   - `requireAuth()` - Requires authentication (throws UNAUTHORIZED)
   - `requireRole()` - Requires specific role (throws FORBIDDEN if role mismatch)

2. **`AUTH_SETUP.md`** - Setup documentation
3. **`test_auth.sh`** - Test script with example curl commands

### Modified Files
1. **`src/app/api/campaigns/route.ts`**
   - POST: Added `requireRole(request, "ARTIST")` check
   - Uses authenticated artist ID instead of finding first ARTIST user

2. **`src/app/api/campaigns/[campaignId]/missions/route.ts`**
   - POST: Added `requireRole(request, "ARTIST")` check
   - Added ownership verification: `campaign.artist_id === artistId`

3. **`src/app/api/missions/[missionId]/accept/route.ts`**
   - POST: Added `requireRole(request, "CREATOR")` check
   - Uses `authUserId` (Supabase auth ID) as `creator_id` instead of placeholder

4. **`src/app/api/missions/[missionId]/submit/route.ts`**
   - POST: Added `requireRole(request, "CREATOR")` check
   - Uses `authUserId` (Supabase auth ID) as `creator_id`
   - Ownership check already existed, now uses real auth user ID

## Environment Variables Required

Add to `.env.local`:

```env
# Required for Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Dev Artist ID (integer from users table)
# If not set, uses first ARTIST user found
DEV_ARTIST_ID=1
```

## Authorization Rules Implemented

| Endpoint | Method | Auth Required | Role Required | Ownership Check |
|----------|--------|---------------|---------------|-----------------|
| `/api/campaigns` | POST | ✅ | ARTIST | N/A |
| `/api/campaigns/[id]/missions` | POST | ✅ | ARTIST | Campaign owner |
| `/api/missions/[id]/accept` | POST | ✅ | CREATOR | N/A (state must be OPEN) |
| `/api/missions/[id]/submit` | POST | ✅ | CREATOR | Mission owner + state must be ACCEPTED |
| All GET endpoints | GET | ❌ | N/A | N/A (permissive) |

## Error Responses

- **401 Unauthorized**: Missing or invalid JWT token
  ```json
  { "error": "Unauthorized" }
  ```

- **403 Forbidden**: Authenticated but insufficient permissions or ownership mismatch
  ```json
  { "error": "Forbidden" }
  ```

## User ID Mapping Strategy

### ARTIST Role
- Uses `DEV_ARTIST_ID` from environment (if set)
- Falls back to first ARTIST user in database
- Maps to integer `id` in `users` table
- Used for `campaigns.artist_id` (integer foreign key)

### CREATOR Role
- Uses Supabase auth user ID directly (UUID string)
- Stored in `missions.creator_id` (varchar field)
- No mapping to `users` table needed

## Testing

### Example: Unauthenticated Request (should return 401)
```bash
curl -X POST http://localhost:3004/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "budgetCents": 50000}'
```

### Example: Authenticated Request (ARTIST role)
```bash
curl -X POST http://localhost:3004/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -d '{"title": "Test Campaign", "budgetCents": 50000}'
```

### Example: Authenticated Request (CREATOR role)
```bash
curl -X POST http://localhost:3004/api/missions/MISSION_ID/accept \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN"
```

## Verification Checklist

- [ ] Environment variables set in `.env.local`
- [ ] Supabase project URL and anon key configured
- [ ] `DEV_ARTIST_ID` set (optional, or ensure ARTIST user exists in DB)
- [ ] Unauthenticated POST requests return 401
- [ ] Authenticated ARTIST can create campaigns
- [ ] Authenticated ARTIST can only create missions for own campaigns
- [ ] Authenticated CREATOR can accept missions (sets creator_id)
- [ ] Authenticated CREATOR can only submit own missions
- [ ] GET endpoints remain publicly accessible
- [ ] Creator mismatch returns 403
- [ ] Campaign ownership mismatch returns 403

## Notes

- No database schema changes were made
- GET endpoints remain permissive (no auth required)
- Auth verification happens server-side using Supabase client
- JWT tokens are verified on each request
- No RLS policies implemented (handled at application level)

