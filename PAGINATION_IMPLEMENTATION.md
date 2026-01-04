# Pagination Implementation Summary

## Files Created

1. **`src/lib/pagination.ts`** - Pagination helper module
   - `parsePaginationParams()` - Parses and validates query parameters
   - `encodeCursor()` - Encodes cursor to base64 string
   - `buildOrderBy()` - Builds Drizzle orderBy clause
   - `buildCursorWhere()` - Builds Drizzle where clause for cursor pagination

2. **`PAGINATION_GUIDE.md`** - User-facing documentation
3. **`test_pagination.sh`** - Test script with examples

## Files Modified

1. **`src/app/api/campaigns/route.ts`**
   - Updated `GET()` to support pagination
   - Backward compatible: returns plain array if no pagination params

2. **`src/app/api/campaigns/[campaignId]/missions/route.ts`**
   - Updated `GET()` to support pagination
   - Maintains campaign existence check
   - Backward compatible

3. **`src/app/api/missions/route.ts`**
   - Updated `GET()` to support pagination
   - Maintains existing `state` filter support
   - Backward compatible

## Features

### Query Parameters
- `limit`: 1-100 (default: 20 when pagination active)
- `cursor`: Base64-encoded JSON cursor from previous response
- `sort`: `created_at_desc`, `created_at_asc`, `id_desc`, `id_asc` (default: `created_at_desc`)
- `state`: (missions only) Filter by mission state

### Response Format
- **Without pagination**: Plain array (backward compatible)
- **With pagination**: `{ data: [...], nextCursor: string | null }`

### Implementation Details
- **Keyset pagination** (not OFFSET-based) for better performance
- **Stable ordering** using `created_at` + `id` as tiebreaker
- **No duplicates** across pages
- **Efficient** for large datasets

## Example Usage

### First Page
```bash
curl "http://localhost:3004/api/campaigns?limit=5"
```

Response:
```json
{
  "data": [...5 campaigns...],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wNVQxMjowMDowMC4wMDBaIiwiaWQiOjV9"
}
```

### Next Page
```bash
curl "http://localhost:3004/api/campaigns?limit=5&cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wNVQxMjowMDowMC4wMDBaIiwiaWQiOjV9"
```

### With Sorting
```bash
curl "http://localhost:3004/api/campaigns?limit=10&sort=created_at_asc"
```

### Missions with State Filter
```bash
curl "http://localhost:3004/api/missions?state=OPEN&limit=20"
```

## Error Handling

All endpoints return 400 with helpful error messages for:
- Invalid limit (must be 1-100)
- Invalid sort option
- Invalid cursor format

## Backward Compatibility

✅ **Fully backward compatible**
- Existing clients without pagination params receive plain arrays
- No breaking changes to existing API contracts

## Performance Considerations

### Recommended Indexes

For optimal performance with large datasets, consider adding:

```sql
-- Campaigns
CREATE INDEX idx_campaigns_created_at_id ON campaigns(created_at DESC, id DESC);
CREATE INDEX idx_campaigns_id ON campaigns(id DESC);

-- Missions
CREATE INDEX idx_missions_created_at_id ON missions(created_at DESC, id DESC);
CREATE INDEX idx_missions_campaign_created_at_id ON missions(campaign_id, created_at DESC, id DESC);
CREATE INDEX idx_missions_state_created_at_id ON missions(state, created_at DESC, id DESC);
```

These indexes are **not required** but will improve query performance for paginated requests.

## Testing

Run the test script:
```bash
./test_pagination.sh
```

Or test manually:
```bash
# First page
curl "http://localhost:3004/api/campaigns?limit=3"

# Extract nextCursor and use for second page
curl "http://localhost:3004/api/campaigns?limit=3&cursor=<nextCursor>"

# Verify backward compatibility
curl "http://localhost:3004/api/campaigns"
```

