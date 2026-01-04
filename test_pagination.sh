#!/bin/bash

# Pagination Test Script
BASE_URL="http://localhost:3004"

echo "=== Testing Pagination ==="
echo ""

echo "1. First page of campaigns (limit=3):"
FIRST_PAGE=$(curl -s "$BASE_URL/api/campaigns?limit=3")
echo "$FIRST_PAGE" | jq '.' || echo "$FIRST_PAGE"
echo ""

# Extract nextCursor from first page
NEXT_CURSOR=$(echo "$FIRST_PAGE" | jq -r '.nextCursor // empty')

if [ -n "$NEXT_CURSOR" ] && [ "$NEXT_CURSOR" != "null" ]; then
  echo "2. Second page using cursor:"
  SECOND_PAGE=$(curl -s "$BASE_URL/api/campaigns?limit=3&cursor=$NEXT_CURSOR")
  echo "$SECOND_PAGE" | jq '.' || echo "$SECOND_PAGE"
  echo ""
  
  echo "3. Verifying no duplicates:"
  FIRST_IDS=$(echo "$FIRST_PAGE" | jq -r '.data[].id' | sort)
  SECOND_IDS=$(echo "$SECOND_PAGE" | jq -r '.data[].id' | sort)
  
  if comm -12 <(echo "$FIRST_IDS") <(echo "$SECOND_IDS") | grep -q .; then
    echo "❌ ERROR: Duplicate IDs found between pages!"
  else
    echo "✓ No duplicates found"
  fi
else
  echo "⚠️  No nextCursor found (might be last page or only one page)"
fi

echo ""
echo "4. Testing different sort orders:"
echo "   - created_at_asc:"
curl -s "$BASE_URL/api/campaigns?limit=2&sort=created_at_asc" | jq '.data[] | {id, created_at}' || echo "Error"
echo ""
echo "   - id_desc:"
curl -s "$BASE_URL/api/campaigns?limit=2&sort=id_desc" | jq '.data[] | {id, created_at}' || echo "Error"
echo ""

echo "5. Testing missions with state filter and pagination:"
curl -s "$BASE_URL/api/missions?state=SUBMITTED&limit=2" | jq '.' || echo "Error"
echo ""

echo "6. Testing backward compatibility (no pagination params):"
BACKWARD_COMPAT=$(curl -s "$BASE_URL/api/campaigns")
if echo "$BACKWARD_COMPAT" | jq -e 'type == "array"' > /dev/null 2>&1; then
  echo "✓ Backward compatible: Returns plain array"
else
  echo "❌ ERROR: Should return plain array when no pagination params"
fi
echo ""

echo "7. Testing error handling:"
echo "   - Invalid limit:"
curl -s "$BASE_URL/api/campaigns?limit=200" | jq '.' || echo "Error"
echo ""
echo "   - Invalid sort:"
curl -s "$BASE_URL/api/campaigns?sort=invalid_sort" | jq '.' || echo "Error"
echo ""
echo "   - Invalid cursor:"
curl -s "$BASE_URL/api/campaigns?cursor=invalid_cursor" | jq '.' || echo "Error"

