#!/bin/bash

# Mortgage Backed Monopoly - Comprehensive Test Script
# Tests authentication, room creation, joining, and game functionality

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${TEST_URL:-https://mortgagebacked.netlify.app}"
SUPABASE_URL="https://scpkafqiooxfvycwzqla.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcGthZnFpb294ZnZ5Y3d6cWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MTU1MTksImV4cCI6MjA3ODM5MTUxOX0.nl__3JFaZWIDPc8zAo4LQ0JQC-3gdQGErjqAURNHSwM"

# Generate unique test identifiers
TIMESTAMP=$(date +%s)
TEST_EMAIL_1="test.player1.${TIMESTAMP}@test-monopoly.dev"
TEST_EMAIL_2="test.player2.${TIMESTAMP}@test-monopoly.dev"
TEST_PASSWORD="TestPass123!"
ROOM_NAME="Test Game ${TIMESTAMP}"

# Test state
USER1_TOKEN=""
USER2_TOKEN=""
ROOM_ID=""
INVITE_CODE=""
GAME_ID=""

# Helper functions
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Test frontend is accessible
test_frontend_accessible() {
    print_header "Testing Frontend Accessibility"

    print_info "Checking if site is accessible..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL")

    if [ "$STATUS" -eq 200 ] || [ "$STATUS" -eq 301 ] || [ "$STATUS" -eq 302 ]; then
        print_success "Site is accessible (HTTP $STATUS)"
    else
        print_error "Site returned HTTP $STATUS"
        return 1
    fi

    print_info "Checking if auth page exists..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth.html")
    if [ "$STATUS" -eq 200 ]; then
        print_success "Auth page is accessible"
    else
        print_error "Auth page not found (HTTP $STATUS)"
        return 1
    fi

    print_info "Checking if lobby page exists..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/lobby.html")
    if [ "$STATUS" -eq 200 ]; then
        print_success "Lobby page is accessible"
    else
        print_error "Lobby page not found (HTTP $STATUS)"
        return 1
    fi
}

# Test Supabase connection
test_supabase_connection() {
    print_header "Testing Supabase Connection"

    print_info "Checking Supabase API health..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/rest/v1/" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $SUPABASE_KEY")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 404 ]; then
        print_success "Supabase API is accessible"
    else
        print_error "Supabase API returned HTTP $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi
}

# Test user signup
test_user_signup() {
    local EMAIL=$1
    local PLAYER_NUM=$2

    print_header "Testing User Signup - Player $PLAYER_NUM"

    print_info "Signing up $EMAIL..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/auth/v1/signup" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$EMAIL\",
            \"password\": \"$TEST_PASSWORD\",
            \"data\": {
                \"display_name\": \"Test Player $PLAYER_NUM\"
            }
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "User signed up successfully"

        # Extract access token
        TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$TOKEN" ]; then
            print_success "Access token received"
            if [ "$PLAYER_NUM" -eq 1 ]; then
                USER1_TOKEN="$TOKEN"
            else
                USER2_TOKEN="$TOKEN"
            fi
        else
            print_error "No access token in response"
            echo "Response: $BODY"
            return 1
        fi
    else
        print_error "Signup failed with HTTP $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi
}

# Test user login
test_user_login() {
    local EMAIL=$1
    local PLAYER_NUM=$2

    print_header "Testing User Login - Player $PLAYER_NUM"

    print_info "Logging in $EMAIL..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "User logged in successfully"

        TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$TOKEN" ]; then
            print_success "Access token received"
            if [ "$PLAYER_NUM" -eq 1 ]; then
                USER1_TOKEN="$TOKEN"
            else
                USER2_TOKEN="$TOKEN"
            fi
        else
            print_error "No access token in response"
            return 1
        fi
    else
        print_error "Login failed with HTTP $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi
}

# Test room creation
test_create_room() {
    print_header "Testing Room Creation"

    if [ -z "$USER1_TOKEN" ]; then
        print_error "User 1 not authenticated"
        return 1
    fi

    # Get current user ID
    print_info "Getting user ID..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/auth/v1/user" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -ne 200 ]; then
        print_error "Failed to get user info (HTTP $HTTP_CODE)"
        return 1
    fi

    USER_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    print_success "User ID: $USER_ID"

    # Generate invite code
    INVITE_CODE=$(cat /dev/urandom | LC_ALL=C tr -dc 'A-Z0-9' | fold -w 6 | head -n 1)
    print_info "Generated invite code: $INVITE_CODE"

    # Create room
    print_info "Creating room..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/rooms" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "{
            \"invite_code\": \"$INVITE_CODE\",
            \"host_id\": \"$USER_ID\",
            \"name\": \"$ROOM_NAME\",
            \"max_players\": 4,
            \"status\": \"waiting\"
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Room created successfully"

        ROOM_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$ROOM_ID" ]; then
            print_success "Room ID: $ROOM_ID"
            print_success "Invite Code: $INVITE_CODE"
        else
            print_error "No room ID in response"
            return 1
        fi
    else
        print_error "Room creation failed with HTTP $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi

    # Add host as room member
    print_info "Adding host to room members..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/room_members" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "{
            \"room_id\": \"$ROOM_ID\",
            \"user_id\": \"$USER_ID\",
            \"player_name\": \"Test Player 1\"
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Host added to room members"
    else
        print_error "Failed to add host to room (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test joining room
test_join_room() {
    print_header "Testing Room Joining"

    if [ -z "$USER2_TOKEN" ]; then
        print_error "User 2 not authenticated"
        return 1
    fi

    if [ -z "$INVITE_CODE" ]; then
        print_error "No invite code available"
        return 1
    fi

    # Get user 2 ID
    print_info "Getting user 2 ID..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/auth/v1/user" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER2_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -ne 200 ]; then
        print_error "Failed to get user 2 info (HTTP $HTTP_CODE)"
        return 1
    fi

    USER2_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    print_success "User 2 ID: $USER2_ID"

    # Find room by invite code
    print_info "Finding room with invite code $INVITE_CODE..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/rest/v1/rooms?invite_code=eq.$INVITE_CODE" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER2_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Room found"
    else
        print_error "Failed to find room (HTTP $HTTP_CODE)"
        return 1
    fi

    # Join room
    print_info "Joining room..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/room_members" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER2_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "{
            \"room_id\": \"$ROOM_ID\",
            \"user_id\": \"$USER2_ID\",
            \"player_name\": \"Test Player 2\"
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Successfully joined room"
    else
        print_error "Failed to join room (HTTP $HTTP_CODE)"
        BODY=$(echo "$RESPONSE" | sed '$d')
        echo "Response: $BODY"
        return 1
    fi

    # Verify room members
    print_info "Verifying room members..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/rest/v1/room_members?room_id=eq.$ROOM_ID" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        MEMBER_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
        print_success "Room has $MEMBER_COUNT members"

        if [ "$MEMBER_COUNT" -eq 2 ]; then
            print_success "Both players in room"
        else
            print_error "Expected 2 members, found $MEMBER_COUNT"
            return 1
        fi
    else
        print_error "Failed to verify members (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test game creation
test_create_game() {
    print_header "Testing Game Creation"

    if [ -z "$USER1_TOKEN" ] || [ -z "$ROOM_ID" ]; then
        print_error "Missing prerequisites for game creation"
        return 1
    fi

    # Create initial game state
    INITIAL_STATE='{
        "players": [
            {
                "name": "Test Player 1",
                "cash": 1500,
                "properties": [],
                "equities": [],
                "debts": [],
                "interestOwed": 0,
                "netWorth": 1500,
                "bankrupt": false
            },
            {
                "name": "Test Player 2",
                "cash": 1500,
                "properties": [],
                "equities": [],
                "debts": [],
                "interestOwed": 0,
                "netWorth": 1500,
                "bankrupt": false
            }
        ],
        "currentPlayerIndex": 0,
        "properties": [],
        "corporations": [],
        "gameLog": [],
        "settings": {
            "interestRate": 5,
            "passGoAmount": 200
        }
    }'

    print_info "Creating game..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/games" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "{
            \"room_id\": \"$ROOM_ID\",
            \"game_state\": $INITIAL_STATE,
            \"current_player_index\": 0
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Game created successfully"

        GAME_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$GAME_ID" ]; then
            print_success "Game ID: $GAME_ID"
        else
            print_error "No game ID in response"
            return 1
        fi
    else
        print_error "Game creation failed with HTTP $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi

    # Update room status
    print_info "Updating room status to in_progress..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "$SUPABASE_URL/rest/v1/rooms?id=eq.$ROOM_ID" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"status": "in_progress"}')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 204 ]; then
        print_success "Room status updated"
    else
        print_error "Failed to update room status (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test game actions
test_game_actions() {
    print_header "Testing Game Actions"

    if [ -z "$GAME_ID" ] || [ -z "$USER1_TOKEN" ]; then
        print_error "Game not created"
        return 1
    fi

    # Simulate player 1 buying a property
    print_info "Simulating property purchase..."

    # Log game event
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/rest/v1/game_events" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"game_id\": \"$GAME_ID\",
            \"event_type\": \"property_purchase\",
            \"event_data\": {
                \"player\": \"Test Player 1\",
                \"property\": \"Mediterranean Avenue\",
                \"price\": 60
            }
        }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Property purchase logged"
    else
        print_error "Failed to log event (HTTP $HTTP_CODE)"
        return 1
    fi

    # Update game state
    print_info "Updating game state..."
    UPDATED_STATE='{
        "players": [
            {
                "name": "Test Player 1",
                "cash": 1440,
                "properties": [{"name": "Mediterranean Avenue", "price": 60}],
                "equities": [],
                "debts": [],
                "interestOwed": 0,
                "netWorth": 1500,
                "bankrupt": false
            },
            {
                "name": "Test Player 2",
                "cash": 1500,
                "properties": [],
                "equities": [],
                "debts": [],
                "interestOwed": 0,
                "netWorth": 1500,
                "bankrupt": false
            }
        ],
        "currentPlayerIndex": 1
    }'

    RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "$SUPABASE_URL/rest/v1/games?id=eq.$GAME_ID" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"game_state\": $UPDATED_STATE}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 204 ]; then
        print_success "Game state updated"
    else
        print_error "Failed to update game state (HTTP $HTTP_CODE)"
        return 1
    fi

    # Verify game state
    print_info "Verifying game state..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/rest/v1/games?id=eq.$GAME_ID" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $USER1_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Game state retrieved"

        if echo "$BODY" | grep -q "Mediterranean Avenue"; then
            print_success "Property purchase verified in game state"
        else
            print_error "Property not found in game state"
            return 1
        fi
    else
        print_error "Failed to retrieve game state (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Cleanup test data
cleanup_test_data() {
    print_header "Cleaning Up Test Data"

    if [ -n "$ROOM_ID" ] && [ -n "$USER1_TOKEN" ]; then
        print_info "Deleting test room..."
        curl -s -X DELETE "$SUPABASE_URL/rest/v1/rooms?id=eq.$ROOM_ID" \
            -H "apikey: $SUPABASE_KEY" \
            -H "Authorization: Bearer $USER1_TOKEN" > /dev/null
        print_success "Test room deleted"
    fi

    print_info "Note: Test users remain in auth.users (manual cleanup required if needed)"
}

# Main test execution
main() {
    print_header "Mortgage Backed Monopoly - Comprehensive Test Suite"
    echo "Testing site: $BASE_URL"
    echo "Timestamp: $(date)"

    FAILED_TESTS=0

    # Run all tests
    test_frontend_accessible || ((FAILED_TESTS++))
    test_supabase_connection || ((FAILED_TESTS++))
    test_user_signup "$TEST_EMAIL_1" 1 || ((FAILED_TESTS++))
    test_user_signup "$TEST_EMAIL_2" 2 || ((FAILED_TESTS++))
    test_create_room || ((FAILED_TESTS++))
    test_join_room || ((FAILED_TESTS++))
    test_create_game || ((FAILED_TESTS++))
    test_game_actions || ((FAILED_TESTS++))

    # Cleanup
    cleanup_test_data

    # Summary
    print_header "Test Summary"

    if [ $FAILED_TESTS -eq 0 ]; then
        print_success "All tests passed! 🎉"
        echo -e "\n${GREEN}✓ Frontend accessible${NC}"
        echo -e "${GREEN}✓ Supabase connection working${NC}"
        echo -e "${GREEN}✓ User authentication working${NC}"
        echo -e "${GREEN}✓ Room creation working${NC}"
        echo -e "${GREEN}✓ Room joining working${NC}"
        echo -e "${GREEN}✓ Game creation working${NC}"
        echo -e "${GREEN}✓ Game actions working${NC}"
        exit 0
    else
        print_error "$FAILED_TESTS test(s) failed"
        exit 1
    fi
}

# Run tests
main
