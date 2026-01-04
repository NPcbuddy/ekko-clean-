# Authentication & Authorization Setup

## Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# Supabase Configuration (required for auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Dev Artist ID (for ARTIST role actions)
# If not set, the system will use the first ARTIST user found in the database
DEV_ARTIST_ID=1
```

### How to Get Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### DEV_ARTIST_ID

- This is the `id` (integer) from the `users` table for an ARTIST user
- Used when authenticated users with ARTIST role need to create campaigns
- If not set, the system will find the first ARTIST user in the database
- You can find this ID by querying: `SELECT id FROM users WHERE role = 'ARTIST' LIMIT 1;`

## Authentication Flow

1. Client sends JWT token in `Authorization` header: `Bearer <token>`
2. Server verifies token with Supabase Auth
3. Server extracts user ID from token
4. For ARTIST actions: Maps to app user ID via `DEV_ARTIST_ID` or first ARTIST user
5. For CREATOR actions: Uses Supabase auth user ID directly as `creator_id` in missions

## Authorization Rules

### POST /api/campaigns
- **Required Role**: ARTIST
- **Auth**: Required
- **Ownership**: N/A (creates new campaign)

### POST /api/campaigns/[campaignId]/missions
- **Required Role**: ARTIST
- **Auth**: Required
- **Ownership**: Must own the campaign (`campaign.artist_id` must match authenticated artist ID)

### POST /api/missions/[missionId]/accept
- **Required Role**: CREATOR
- **Auth**: Required
- **Ownership**: N/A (accepts open mission)
- **State Check**: Mission must be `OPEN`

### POST /api/missions/[missionId]/submit
- **Required Role**: CREATOR
- **Auth**: Required
- **Ownership**: Must own the mission (`mission.creator_id` must match authenticated user ID)
- **State Check**: Mission must be `ACCEPTED`

### GET Endpoints
- **Auth**: Not required (permissive for now)
- All GET endpoints remain publicly accessible

## Error Responses

- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Authenticated but insufficient permissions or ownership mismatch
- **400 Bad Request**: Invalid request data or validation errors
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server-side error

## Testing

See `test_auth.sh` for example curl commands.

