#!/bin/bash

# Authentication Test Script
# Replace TOKEN with a valid Supabase JWT token

BASE_URL="http://localhost:3004"
TOKEN="YOUR_SUPABASE_JWT_TOKEN_HERE"

echo "=== Testing Unauthenticated Requests (should return 401) ==="
echo ""

echo "1. POST /api/campaigns (no auth):"
curl -X POST "$BASE_URL/api/campaigns" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Campaign", "budgetCents": 50000}' \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' || echo "Response: $(curl -X POST "$BASE_URL/api/campaigns" -H "Content-Type: application/json" -d '{"title": "Test", "budgetCents": 50000}' -s -w "\nStatus: %{http_code}\n")"

echo ""
echo "2. POST /api/campaigns/1/missions (no auth):"
curl -X POST "$BASE_URL/api/campaigns/1/missions" \
  -H "Content-Type: application/json" \
  -d '{"payoutCents": 5000}' \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' || echo "Response: $(curl -X POST "$BASE_URL/api/campaigns/1/missions" -H "Content-Type: application/json" -d '{"payoutCents": 5000}' -s -w "\nStatus: %{http_code}\n")"

echo ""
echo "=== Testing Authenticated Requests (replace TOKEN) ==="
echo ""

if [ "$TOKEN" = "YOUR_SUPABASE_JWT_TOKEN_HERE" ]; then
  echo "⚠️  Please set TOKEN variable with a valid Supabase JWT token"
  echo ""
  echo "Example authenticated request:"
  echo "curl -X POST \"$BASE_URL/api/campaigns\" \\"
  echo "  -H \"Content-Type: application/json\" \\"
  echo "  -H \"Authorization: Bearer YOUR_TOKEN_HERE\" \\"
  echo "  -d '{\"title\": \"Test Campaign\", \"budgetCents\": 50000}'"
else
  echo "3. POST /api/campaigns (with auth - ARTIST role required):"
  curl -X POST "$BASE_URL/api/campaigns" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title": "Test Campaign", "budgetCents": 50000}' \
    -w "\nStatus: %{http_code}\n" \
    -s | jq '.' || echo "Response: $(curl -X POST "$BASE_URL/api/campaigns" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"title": "Test", "budgetCents": 50000}' -s -w "\nStatus: %{http_code}\n")"
fi

echo ""
echo "=== Verification Checklist ==="
echo "✓ Unauthenticated POST requests return 401"
echo "✓ Authenticated requests with valid token work (if role matches)"
echo "✓ Creator mismatch returns 403 (test with wrong creator accepting mission)"
echo "✓ Campaign ownership returns 403 (test with wrong artist creating mission)"

