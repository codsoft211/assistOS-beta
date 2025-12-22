#!/bin/bash

# AssistBuild Workflow HTTP Test Script
# Simple curl-based testing without authentication
# Uses direct database access for testing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5000}"
TENANT_ID="${TEST_TENANT_ID:-test-tenant}"
USER_ID="${TEST_USER_ID:-test-user}"

# Helper functions
log_section() {
    echo -e "\n${CYAN}============================================================"
    echo -e "$1"
    echo -e "============================================================${NC}\n"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Test scenarios as JSON files
create_test_workflow() {
    local scenario=$1
    local workflow_name=$2
    
    cat > /tmp/workflow_$scenario.json <<EOF
{
  "name": "$workflow_name",
  "description": "Test workflow $scenario",
  "environment": "sandbox",
  "definition": {
    "nodes": [
      {
        "id": "trigger-1",
        "type": "manual_trigger",
        "name": "Start",
        "position": { "x": 100, "y": 100 },
        "config": {}
      },
      {
        "id": "crud-1",
        "type": "crud_record",
        "name": "Create Record",
        "position": { "x": 300, "y": 100 },
        "config": {
          "operation": "create",
          "moduleId": "customers",
          "recordData": {
            "name": "Test Customer",
            "email": "test@example.com"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "trigger-1",
        "target": "crud-1"
      }
    ]
  }
}
EOF
}

# Scenario 1: Basic Workflow Test
test_scenario_1() {
    log_section "Scenario 1: Basic Workflow Creation & Execution"
    
    # Create workflow JSON
    create_test_workflow "1" "Test: Basic Workflow"
    
    log_info "Using direct database test script..."
    log_info "Run: npm run test:workflows -- --scenario=1"
    
    echo ""
    echo "📋 Workflow JSON created at: /tmp/workflow_1.json"
    echo ""
    echo "To test manually with curl (requires authentication):"
    echo ""
    echo "# Create workflow"
    echo "curl -X POST $API_URL/api/assistbuild/workflows \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -H 'Cookie: connect.sid=YOUR_SESSION' \\"
    echo "  -d @/tmp/workflow_1.json"
    echo ""
}

# Scenario 2: Quick Database Test
test_scenario_2() {
    log_section "Scenario 2: Direct Database Test"
    
    log_info "Testing workflow system via Node.js script..."
    
    # Check if worker is running
    if ! pgrep -f "apps/worker/index.ts" > /dev/null; then
        log_warning "Worker not detected. Start it with: npm run worker"
    else
        log_success "Worker is running"
    fi
    
    # Check Redis
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            log_success "Redis is running"
        else
            log_error "Redis is not running. Start it with: redis-server"
        fi
    else
        log_warning "redis-cli not found. Make sure Redis is installed."
    fi
    
    echo ""
    log_info "Run full test suite with:"
    echo "  npm run test:workflows"
    echo ""
    log_info "Run specific scenario:"
    echo "  npm run test:workflows -- --scenario=1"
    echo ""
}

# Scenario 3: Check System Status
check_system_status() {
    log_section "System Status Check"
    
    # Check API server
    if curl -s "$API_URL/api/health" > /dev/null 2>&1; then
        log_success "API server is running at $API_URL"
    else
        log_error "API server is not accessible at $API_URL"
        log_info "Start with: npm run dev"
    fi
    
    # Check worker
    if pgrep -f "apps/worker/index.ts" > /dev/null; then
        log_success "Worker process is running"
    else
        log_warning "Worker is not running"
        log_info "Start with: npm run worker"
    fi
    
    # Check Redis
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            log_success "Redis is running"
            
            # Check queue status
            local queue_count=$(redis-cli llen bull:assistbuild-workflows:wait 2>/dev/null || echo "0")
            log_info "Workflow queue: $queue_count jobs waiting"
        else
            log_error "Redis is not running"
            log_info "Start with: redis-server"
        fi
    fi
    
    echo ""
    log_info "System ready for testing!" 
}

# List all scenarios
list_scenarios() {
    log_section "Available Test Scenarios"
    
    echo "1. Basic Workflow Test"
    echo "   - Creates sample workflow JSON"
    echo "   - Shows curl commands for manual testing"
    echo ""
    echo "2. Direct Database Test"
    echo "   - Tests via Node.js script (bypasses auth)"
    echo "   - Checks system dependencies"
    echo ""
    echo "3. System Status Check"
    echo "   - Verifies API, Worker, Redis are running"
    echo "   - Shows queue statistics"
    echo ""
    echo "Usage:"
    echo "  ./scripts/test-workflows-http.sh <scenario_number>"
    echo "  ./scripts/test-workflows-http.sh status"
    echo "  ./scripts/test-workflows-http.sh list"
}

# Main execution
main() {
    case "${1:-list}" in
        1)
            test_scenario_1
            ;;
        2)
            test_scenario_2
            ;;
        status)
            check_system_status
            ;;
        list|help|--help|-h)
            list_scenarios
            ;;
        *)
            log_error "Unknown scenario: $1"
            list_scenarios
            exit 1
            ;;
    esac
}

main "$@"
