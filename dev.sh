#!/bin/bash

# Development helper script for Gemini Improve UI extension

CHROME_DEBUG_PORT=9222
CHROME_USER_DIR="$(pwd)/.chrome-devtools-mcp"
CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PID_FILE="${CHROME_USER_DIR}/.chrome-debug.pid"
TEST_CHAT_URL="https://gemini.google.com/app/337b024810e896b8"
EXTENSION_DIR="$(pwd)/dist/chrome-mv3"
EXTENSION_DEV_DIR="$(pwd)/dist/chrome-mv3-dev"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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

find_profile_chrome_pid() {
  ps aux | grep "[C]hrome.*user-data-dir=${CHROME_USER_DIR}" | awk '{print $2}' | head -n 1
}

ensure_debug_chrome() {
  local ext_dir="${1:-${EXTENSION_DIR}}"

  if check_debug_chrome; then
    return 0
  fi

  if [ ! -f "${ext_dir}/manifest.json" ]; then
    echo -e "${RED}Extension not found: ${ext_dir}${NC}"
    echo -e "${RED}Run 'npm run build' or wait for WXT dev build.${NC}"
    return 1
  fi

  mkdir -p "${CHROME_USER_DIR}"
  local CHROME_ARGS=(
    "--user-data-dir=${CHROME_USER_DIR}"
    "--remote-debugging-port=${CHROME_DEBUG_PORT}"
    "--load-extension=${ext_dir}"
    "https://gemini.google.com/app"
  )

  "${CHROME_BINARY}" "${CHROME_ARGS[@]}" > /dev/null 2>&1 &
  CHROME_PID=$!
  echo ${CHROME_PID} > "${PID_FILE}"
  sleep 2
  if check_debug_chrome; then
    echo -e "${GREEN}Chrome started (PID: ${CHROME_PID}) — DevTools MCP: http://localhost:${CHROME_DEBUG_PORT}${NC}"
    return 0
  fi
  echo -e "${RED}Failed to start Chrome${NC}"
  return 1
}

# Start Chrome with the built extension (no hot reload, for MCP debugging)
start_chrome() {
  local FOREGROUND=false
  local OPEN_TEST_CHAT=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --fg|--foreground) FOREGROUND=true; shift ;;
      --test)            OPEN_TEST_CHAT=true; shift ;;
      *)                 shift ;;
    esac
  done

  if [ ! -d "${EXTENSION_DIR}" ]; then
    echo -e "${RED}Extension not built. Run 'npm run build' first.${NC}"
    exit 1
  fi

  if check_debug_chrome; then
    echo -e "${GREEN}Debug Chrome is already running on port ${CHROME_DEBUG_PORT}${NC}"
    [ "$OPEN_TEST_CHAT" = true ] && open "${TEST_CHAT_URL}"
    exit 0
  fi

  if [ "$FOREGROUND" = true ]; then
    trap cleanup INT TERM
    echo -e "${GREEN}Starting Chrome in foreground (Ctrl+C to stop)${NC}"
    ensure_debug_chrome || exit 1
    [ "$OPEN_TEST_CHAT" = true ] && open "${TEST_CHAT_URL}"
    echo -e "${YELLOW}Hot reload: NOT active. Use './dev.sh dev' for hot reload.${NC}"
    wait ${CHROME_PID}
    cleanup
  else
    ensure_debug_chrome || exit 1
    [ "$OPEN_TEST_CHAT" = true ] && open "${TEST_CHAT_URL}"
    echo -e "${YELLOW}Hot reload: NOT active. Use './dev.sh dev' for hot reload.${NC}"
    echo -e "${YELLOW}Run './dev.sh stop' to stop.${NC}"
  fi
}

start_dev() {
  echo -e "${GREEN}Starting WXT dev server (hot reload)...${NC}"
  npm run dev &
  local wxt_pid=$!

  echo -e "${YELLOW}Waiting for ${EXTENSION_DEV_DIR}...${NC}"
  local i=0
  while [ ! -f "${EXTENSION_DEV_DIR}/manifest.json" ] && [ "$i" -lt 120 ]; do
    sleep 0.25
    i=$((i + 1))
  done
  if [ ! -f "${EXTENSION_DEV_DIR}/manifest.json" ]; then
    kill "$wxt_pid" 2>/dev/null
    echo -e "${RED}Timed out waiting for WXT dev build${NC}"
    exit 1
  fi

  # Chrome must load chrome-mv3-dev (WXT reloads that folder, not chrome-mv3).
  if check_debug_chrome; then
    echo -e "${YELLOW}Restarting Chrome to load dev extension...${NC}"
    stop_chrome
    sleep 1
  fi

  ensure_debug_chrome "${EXTENSION_DEV_DIR}" || exit 1

  echo -e "${YELLOW}DevTools MCP: http://localhost:${CHROME_DEBUG_PORT}${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop WXT (Chrome keeps running — ./dev.sh stop to quit Chrome).${NC}"
  wait "$wxt_pid"
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
      echo -e "${YELLOW}Process not found (PID: ${CHROME_PID})${NC}"
      rm "${PID_FILE}"
    fi
  else
    CHROME_PID=$(find_profile_chrome_pid)
    if [ -z "${CHROME_PID}" ]; then
      CHROME_PID=$(ps aux | grep "[C]hrome.*remote-debugging-port=${CHROME_DEBUG_PORT}" | awk '{print $2}' | head -n 1)
    fi
    if [ ! -z "${CHROME_PID}" ]; then
      kill ${CHROME_PID}
      echo -e "${GREEN}Debug Chrome stopped (PID: ${CHROME_PID})${NC}"
    else
      echo -e "${YELLOW}Debug Chrome is not running${NC}"
    fi
  fi
}

check_status() {
  if check_debug_chrome; then
    echo -e "${GREEN}Debug Chrome is running on port ${CHROME_DEBUG_PORT}${NC}"
    [ -f "${PID_FILE}" ] && echo -e "PID: $(cat ${PID_FILE})"
    curl -s http://localhost:${CHROME_DEBUG_PORT}/json/version | python3 -m json.tool
  else
    echo -e "${RED}Debug Chrome is not running${NC}"; exit 1
  fi
}

case "$1" in
  dev)
    start_dev
    ;;
  start)
    shift
    start_chrome "$@"
    ;;
  stop)
    stop_chrome
    ;;
  restart)
    shift
    stop_chrome
    sleep 1
    start_chrome "$@"
    ;;
  status|check)
    check_status
    ;;
  *)
    echo "Usage: $0 {dev|start|stop|restart|status}"
    echo ""
    echo "Commands:"
    echo "  dev                    - Start Chrome + WXT dev server (hot reload)"
    echo "                           DevTools MCP: port ${CHROME_DEBUG_PORT}"
    echo "  start [options]        - Start Chrome with built extension (no hot reload)"
    echo "                           Requires 'npm run build' beforehand"
    echo "                           --fg: Run in foreground (Ctrl+C to stop)"
    echo "                           --test: Open test chat URL"
    echo "  stop                   - Stop debug Chrome"
    echo "  restart [options]      - Restart debug Chrome"
    echo "  status                 - Check if debug Chrome is running"
    echo ""
    echo "Workflow:"
    echo "  Development:  ./dev.sh dev        # hot reload, MCP on port ${CHROME_DEBUG_PORT}"
    echo "  Production:   npm run build && ./dev.sh start"
    exit 1
    ;;
esac

exit 0
