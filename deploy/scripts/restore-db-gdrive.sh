#!/usr/bin/env bash
set -euo pipefail

# WaveLink Encrypted MySQL Restore & Verification Script
# Usage:
#   ./restore-db-gdrive.sh <backup.sql.gz.age> <private-key-file> [--verify-only] [--target-db <db_name>]

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <backup.sql.gz.age> <private-key-file> [--verify-only] [--target-db <db_name>]" >&2
  exit 1
fi

BACKUP_FILE="$1"
KEY_FILE="$2"
shift 2

VERIFY_ONLY=false
TARGET_DB=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
    --target-db)
      TARGET_DB="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Không tìm thấy file backup: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ ! -f "${KEY_FILE}" ]]; then
  echo "ERROR: Không tìm thấy file Private Key: ${KEY_FILE}" >&2
  exit 1
fi

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  (cd "$(dirname "${BACKUP_FILE}")" && sha256sum -c "$(basename "${BACKUP_FILE}.sha256")")
fi

if [[ "${VERIFY_ONLY}" == "true" ]]; then
  TABLES_COUNT="$(age -d -i "${KEY_FILE}" "${BACKUP_FILE}" | gunzip | grep -c '^CREATE TABLE' || true)"
  echo "Verify OK: giải mã & giải nén thành công, phát hiện ${TABLES_COUNT} bảng CREATE TABLE."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      if [[ -z "${!key:-}" ]]; then
        export "${key}=${val}"
      fi
    fi
  done < "$f"
}

load_env_file "${REPO_DIR}/env.backup"
load_env_file "${REPO_DIR}/env.vps"

DB_HOST="${BACKUP_DB_HOST:-127.0.0.1}"
DB_PORT="${BACKUP_DB_PORT:-3306}"
DB_NAME="${TARGET_DB:-${MYSQL_DATABASE:-audio_app}}"
DB_USER="${BACKUP_DB_USER:-${MYSQL_USER:-root}}"
DB_PASS="${BACKUP_DB_PASS:-${MYSQL_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}}"

if [[ -z "${DB_PASS}" ]]; then
  echo "ERROR: Thiếu mật khẩu MySQL trong env.vps / env.backup" >&2
  exit 1
fi

echo "Đang khôi phục ${BACKUP_FILE} -> ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME} ..."
age -d -i "${KEY_FILE}" "${BACKUP_FILE}" \
  | gunzip \
  | MYSQL_PWD="${DB_PASS}" mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}"

echo "Restore hoàn tất vào database '${DB_NAME}'."
