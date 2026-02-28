#!/bin/bash

# Development helper script for Gemini Improve UI extension

CHROME_DEBUG_PORT=9222
CHROME_USER_DIR="$(pwd)/.chrome-devtools-mcp"
CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PID_FILE="${CHROME_USER_DIR}/.chrome-debug.pid"
TEST_CHAT_URL="https://gemini.google.com/app/337b024810e896b8"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Cleanup function for foreground mode
cleanup() {
  echo -e "\n${YELLOW}Cleaning up debug Chrome...${NC}"
  if [ ! -z "${CHROME_PID}" ]; then
    kill ${CHROME_PID} 2>/dev/null
    rm -f "${PID_FILE}"
    echo -e "${GREEN}Debug Chrome stopped${NC}"
  fi
  exit 0
}

check_debug_chrome() {
  curl -s http://localhost:${CHROME_DEBUG_PORT}/json/version > /dev/null 2>&1
  return $?
}

start_chrome() {
  local FOREGROUND=false
  local OPEN_TEST_CHAT=false
  local HEADLESS=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --fg|--foreground)
        FOREGROUND=true
        shift
        ;;
      --test)
        OPEN_TEST_CHAT=true
        shift
        ;;
      --headless)
        HEADLESS=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  echo -e "${YELLOW}Checking if debug Chrome is already running...${NC}"

  if check_debug_chrome; then
    echo -e "${GREEN}Debug Chrome is already running on port ${CHROME_DEBUG_PORT}${NC}"

    if [ "$OPEN_TEST_CHAT" = true ]; then
      echo -e "${YELLOW}Opening test chat URL...${NC}"
      open "${TEST_CHAT_URL}"
    fi

    exit 0
  fi

  echo -e "${YELLOW}Starting Chrome in remote debugging mode...${NC}"

  # Create user data directory if it doesn't exist
  mkdir -p "${CHROME_USER_DIR}"

  # Build Chrome command arguments
  local CHROME_ARGS=(
    "--remote-debugging-port=${CHROME_DEBUG_PORT}"
    "--user-data-dir=${CHROME_USER_DIR}"
    "--load-extension=$(pwd)"
  )

  if [ "$HEADLESS" = true ]; then
    CHROME_ARGS+=("--headless=new")
  fi

  if [ "$OPEN_TEST_CHAT" = true ]; then
    CHROME_ARGS+=("${TEST_CHAT_URL}")
  fi

  if [ "$FOREGROUND" = true ]; then
    # Foreground mode - trap Ctrl+C for cleanup
    trap cleanup INT TERM

    echo -e "${GREEN}Starting in foreground mode (press Ctrl+C to stop)${NC}"

    # Start Chrome in foreground
    "${CHROME_BINARY}" "${CHROME_ARGS[@]}" &

    CHROME_PID=$!
    echo ${CHROME_PID} > "${PID_FILE}"

    # Wait for Chrome to start
    sleep 2

    if check_debug_chrome; then
      echo -e "${GREEN}Chrome started successfully (PID: ${CHROME_PID})${NC}"
      if [ "$HEADLESS" = true ]; then
        echo -e "${GREEN}Mode: Headless${NC}"
      fi
      echo -e "${GREEN}Remote debugging available at http://localhost:${CHROME_DEBUG_PORT}${NC}"
      echo -e "${GREEN}Extension auto-loaded from: $(pwd)${NC}"
      if [ "$OPEN_TEST_CHAT" = true ]; then
        echo -e "${GREEN}Test chat opened: ${TEST_CHAT_URL}${NC}"
      fi
      echo -e "${YELLOW}Press Ctrl+C to stop debug Chrome${NC}"

      # Wait for Chrome process to exit or Ctrl+C
      wait ${CHROME_PID}
      cleanup
    else
      echo -e "${RED}Failed to start Chrome${NC}"
      exit 1
    fi
  else
    # Background mode (default)
    "${CHROME_BINARY}" "${CHROME_ARGS[@]}" > /dev/null 2>&1 &

    CHROME_PID=$!
    echo ${CHROME_PID} > "${PID_FILE}"

    # Wait for Chrome to start
    sleep 2

    if check_debug_chrome; then
      echo -e "${GREEN}Chrome started successfully (PID: ${CHROME_PID})${NC}"
      if [ "$HEADLESS" = true ]; then
        echo -e "${GREEN}Mode: Headless${NC}"
      fi
      echo -e "${GREEN}Remote debugging available at http://localhost:${CHROME_DEBUG_PORT}${NC}"
      echo -e "${GREEN}Extension auto-loaded from: $(pwd)${NC}"
      if [ "$OPEN_TEST_CHAT" = true ]; then
        echo -e "${GREEN}Test chat opened: ${TEST_CHAT_URL}${NC}"
      fi
      echo -e "${YELLOW}Run './dev.sh stop' to stop debug Chrome${NC}"
    else
      echo -e "${RED}Failed to start Chrome${NC}"
      exit 1
    fi
  fi
}

stop_chrome() {
  echo -e "${YELLOW}Stopping debug Chrome...${NC}"

  if [ -f "${PID_FILE}" ]; then
    CHROME_PID=$(cat "${PID_FILE}")
    if ps -p ${CHROME_PID} > /dev/null 2>&1; then
      kill ${CHROME_PID}
      rm "${PID_FILE}"
      echo -e "${GREEN}Debug Chrome stopped (PID: ${CHROME_PID})${NC}"
    else
      echo -e "${YELLOW}Debug Chrome is not running (PID: ${CHROME_PID})${NC}"
      rm "${PID_FILE}"
    fi
  else
    echo -e "${YELLOW}No PID file found. Trying to find debug Chrome process...${NC}"
    # Try to find Chrome with remote debugging port
    CHROME_PID=$(ps aux | grep "[C]hrome.*remote-debugging-port=${CHROME_DEBUG_PORT}" | awk '{print $2}' | head -n 1)
    if [ ! -z "${CHROME_PID}" ]; then
      kill ${CHROME_PID}
      echo -e "${GREEN}Debug Chrome stopped (PID: ${CHROME_PID})${NC}"
    else
      echo -e "${YELLOW}Debug Chrome is not running${NC}"
    fi
  fi
}

restart_chrome() {
  stop_chrome
  sleep 1
  start_chrome "$@"
}

check_status() {
  echo -e "${YELLOW}Checking debug Chrome status...${NC}"

  if check_debug_chrome; then
    echo -e "${GREEN}Debug Chrome is running on port ${CHROME_DEBUG_PORT}${NC}"

    # Try to get PID
    if [ -f "${PID_FILE}" ]; then
      CHROME_PID=$(cat "${PID_FILE}")
      echo -e "PID: ${CHROME_PID}"
    fi

    # Show browser info
    curl -s http://localhost:${CHROME_DEBUG_PORT}/json/version | python3 -m json.tool
  else
    echo -e "${RED}Debug Chrome is not running${NC}"
    exit 1
  fi
}

case "$1" in
  start)
    shift
    start_chrome "$@"
    ;;
  stop)
    stop_chrome
    ;;
  restart)
    shift
    restart_chrome "$@"
    ;;
  status|check)
    check_status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    echo ""
    echo "Commands:"
    echo "  start [options]        - Start Chrome in remote debugging mode"
    echo "                           Extension is auto-loaded from current directory"
    echo "                           --fg: Run in foreground (auto-stops on Ctrl+C)"
    echo "                           --headless: Run in headless mode"
    echo "                           --test: Open test chat URL"
    echo "  stop                   - Stop debug Chrome (leaves normal Chrome running)"
    echo "  restart [options]      - Restart debug Chrome (reloads extension)"
    echo "  status                 - Check if debug Chrome is running"
    echo ""
    echo "Examples:"
    echo "  ./dev.sh start                      # Start with extension auto-loaded"
    echo "  ./dev.sh start --headless           # Headless with extension"
    echo "  ./dev.sh start --headless --test    # Headless + test chat"
    echo "  ./dev.sh restart --headless         # Restart (reloads extension)"
    exit 1
    ;;
esac

exit 0
