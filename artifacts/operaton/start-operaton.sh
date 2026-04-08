#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime"
JAVA_HOME_DEFAULT="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

if [ ! -d "$RUNTIME_DIR" ]; then
  echo "Operaton runtime not found at $RUNTIME_DIR" >&2
  exit 1
fi

if [ -d "$JAVA_HOME_DEFAULT" ]; then
  export JAVA_HOME="${JAVA_HOME:-$JAVA_HOME_DEFAULT}"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

export SERVER_PORT="${OPERATON_PORT:-8080}"
export OPERATON_BPM_RUN_EXAMPLE_ENABLED="${OPERATON_BPM_RUN_EXAMPLE_ENABLED:-false}"

cd "$RUNTIME_DIR"
exec ./internal/run.sh start --webapps --rest
