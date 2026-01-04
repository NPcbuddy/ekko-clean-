# Pagination Guide

## Overview

All GET endpoints for campaigns and missions now support cursor-based pagination and sorting. The implementation is **backward compatible** - existing clients that don't use pagination will continue to receive plain arrays.

## Endpoints with Pagination

- `GET /api/campaigns`
- `GET /api/campaigns/[campaignId]/missions`
- `GET /api/missions` (also supports `?state=OPEN` filter)

## Query Parameters

### `limit` (optional)
- **Type**: Integer
- **Range**: 1-100
- **Default**: 20 (when pagination mode is active)
- **Example**: `?limit=10`

### `cursor` (optional)
- **Type**: String (base64-encoded JSON)
- **Description**: Opaque cursor from previous response's `nextCursor` field
- **Example**: `?cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wMVQxMjowMDowMC4wMDBaIiwiaWQiOjF9`

### `sort` (optional)
- **Type**: String (one of the following)
- **Options**:
  - `created_at_desc` (default) - Newest first
  - `created_at_asc` - Oldest first
  - `id_desc` - Highest ID first
  - `id_asc` - Lowest ID first
- **Example**: `?sort=created_at_asc`

### `state` (missions only)
- **Type**: String
- **Options**: `OPEN`, `ACCEPTED`, `SUBMITTED`, `VERIFIED`, `PAID`, `REJECTED`
- **Example**: `?state=OPEN`

## Response Format

### Without Pagination (Backward Compatible)
If no pagination parameters are provided, the response is a plain array:

```json
[
  {
    "id": 1,
    "title": "Campaign 1",
    "created_at": "2024-01-01T12:00:00.000Z",
    ...
  },
  {
    "id": 2,
    "title": "Campaign 2",
    "created_at": "2024-01-02T12:00:00.000Z",
    ...
  }
]
```

### With Pagination
If any pagination parameter (`limit`, `cursor`, or `sort`) is provided, the response includes:

```json
{
  "data": [
    {
      "id": 1,
      "title": "Campaign 1",
      "created_at": "2024-01-01T12:00:00.000Z",
      ...
    },
    {
      "id": 2,
      "title": "Campaign 2",
      "created_at": "2024-01-02T12:00:00.000Z",
      ...
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wMlQxMjowMDowMC4wMDBaIiwiaWQiOjJ9"
}
```

- `data`: Array of items (up to `limit` items)
- `nextCursor`: Base64-encoded cursor string, or `null` if there are no more pages

## Usage Examples

### Example 1: First Page of Campaigns

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

### Example 2: Next Page Using Cursor

```bash
curl "http://localhost:3004/api/campaigns?limit=5&cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wNVQxMjowMDowMC4wMDBaIiwiaWQiOjV9"
```

### Example 3: Sort by Oldest First

```bash
curl "http://localhost:3004/api/campaigns?limit=10&sort=created_at_asc"
```

### Example 4: Filter Missions by State with Pagination

```bash
curl "http://localhost:3004/api/missions?state=OPEN&limit=20"
```

### Example 5: Campaign Missions with Pagination

```bash
curl "http://localhost:3004/api/campaigns/1/missions?limit=10"
```

## Error Responses

### Invalid Limit
```json
{
  "error": "Invalid limit. Must be an integer between 1 and 100."
}
```
Status: 400

### Invalid Sort
```json
{
  "error": "Invalid sort. Must be one of: created_at_desc, created_at_asc, id_desc, id_asc"
}
```
Status: 400

### Invalid Cursor
```json
{
  "error": "Invalid cursor. Cursor must be a valid base64-encoded JSON string."
}
```
Status: 400

## Implementation Details

- **Pagination Type**: Keyset pagination (not OFFSET-based)
- **Ordering**: Uses `created_at` as primary sort, `id` as tiebreaker
- **Cursor Encoding**: Base64-encoded JSON containing `{ created_at: string, id: string|number }`
- **Performance**: Efficient for large datasets, no duplicate results across pages

## Recommended Database Indexes

For optimal performance, consider adding these indexes (not required, but recommended):

```sql
-- For campaigns
CREATE INDEX idx_campaigns_created_at_id ON campaigns(created_at DESC, id DESC);
CREATE INDEX idx_campaigns_id ON campaigns(id DESC);

-- For missions
CREATE INDEX idx_missions_created_at_id ON missions(created_at DESC, id DESC);
CREATE INDEX idx_missions_campaign_created_at_id ON missions(campaign_id, created_at DESC, id DESC);
CREATE INDEX idx_missions_state_created_at_id ON missions(state, created_at DESC, id DESC);
```

## Testing

See `test_pagination.sh` for example curl commands demonstrating pagination flow.

