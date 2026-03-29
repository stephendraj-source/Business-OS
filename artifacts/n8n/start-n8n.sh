#!/bin/bash
set -e

DOMAIN="${REPLIT_DEV_DOMAIN:-localhost}"
N8N_DIR="${HOME}/.n8n"
mkdir -p "$N8N_DIR"

export N8N_PORT="${PORT:-9000}"
export N8N_HOST="0.0.0.0"
export N8N_PROTOCOL="https"
export N8N_PATH="/n8n/"
export N8N_EDITOR_BASE_URL="https://${DOMAIN}/n8n/"
export WEBHOOK_URL="https://${DOMAIN}/n8n/"
export N8N_SECURE_COOKIE="false"
export N8N_LOG_LEVEL="warn"
export N8N_DIAGNOSTICS_ENABLED="false"
export N8N_VERSION_NOTIFICATIONS_ENABLED="false"
export N8N_SKIP_OWNER_SETUP="true"

# ── Credentials used by the API server proxy for auto-login ──────────────────
export N8N_AUTO_EMAIL="stephen.d.raj@gmail.com"
export N8N_AUTO_PASSWORD="n8n-auto-2024!"
export N8N_TEMPLATES_ENABLED="true"
export EXECUTIONS_DATA_PRUNE="true"
export EXECUTIONS_DATA_MAX_AGE="336"
export N8N_USER_FOLDER="${N8N_DIR}"

# ── Database — use existing PostgreSQL (no native sqlite3 module needed) ──────
export DB_TYPE="postgresdb"
export DB_POSTGRESDB_HOST="helium"
export DB_POSTGRESDB_PORT="5432"
export DB_POSTGRESDB_DATABASE="heliumdb"
export DB_POSTGRESDB_USER="postgres"
export DB_POSTGRESDB_PASSWORD="password"
export DB_POSTGRESDB_SCHEMA="n8n"
export DB_POSTGRESDB_SSL_ENABLED="false"

exec node "$(dirname "$0")/node_modules/.bin/n8n" start
