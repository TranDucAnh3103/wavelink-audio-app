#!/usr/bin/env bash
set -euo pipefail

# WaveLink Encrypted MySQL Backup to Google Drive (Streaming Pipeline)
# - Zero raw .sql files written to disk
# - Streams mysqldump -> gzip -> age encryption -> rclone Google Drive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_VPS="${REPO_DIR}/env.vps"
ENV_BACKUP="${REPO_DIR}/env.backup"

LOCAL_ONLY=false
if [[ "${1:-}" == "--local-only" ]]; then
  LOCAL_ONLY=true
fi

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

load_env_file "${ENV_BACKUP}"
load_env_file "${ENV_VPS}"

DB_HOST="${BACKUP_DB_HOST:-127.0.0.1}"
DB_PORT="${BACKUP_DB_PORT:-3306}"
DB_NAME="${MYSQL_DATABASE:-audio_app}"
DB_USER="${BACKUP_DB_USER:-${MYSQL_USER:-root}}"
DB_PASS="${BACKUP_DB_PASS:-${MYSQL_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wavelink}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
GDRIVE_FOLDER="${GDRIVE_FOLDER:-WaveLink-Backups}"
AGE_PUBLIC_KEY="${AGE_PUBLIC_KEY:-}"

if [[ -z "${AGE_PUBLIC_KEY}" ]]; then
  echo "ERROR: AGE_PUBLIC_KEY chưa được cấu hình trong ${ENV_BACKUP}" >&2
  exit 1
fi
if [[ -z "${DB_PASS}" ]]; then
  echo "ERROR: Không tìm thấy mật khẩu MySQL trong ${ENV_VPS} hoặc ${ENV_BACKUP}" >&2
  exit 1
fi

for bin in mysqldump gzip age sha256sum; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: Thiếu công cụ '$bin'. Vui lòng cài đặt trước." >&2
    exit 1
  fi
done
if [[ "${LOCAL_ONLY}" == "false" ]] && ! command -v rclone >/dev/null 2>&1; then
  echo "ERROR: Thiếu 'rclone'. Chạy: sudo apt install -y rclone" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/wavelink_${DB_NAME}_${TIMESTAMP}.sql.gz.age"
TMP_FILE="${OUT_FILE}.tmp"

notify_webhook() {
  local msg="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -fsS -m 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${msg}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
    curl -fsS -m 10 -H "Content-Type: application/json" \
      -d "{\"content\":\"${msg}\"}" "${DISCORD_WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
}

cleanup_on_error() {
  rm -f "${TMP_FILE}"
  notify_webhook "[WaveLink Backup] FAILED on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
trap cleanup_on_error ERR

# 1. Streaming dump -> gzip -> age (no raw .sql ever hits disk)
MYSQL_PWD="${DB_PASS}" mysqldump \
  -h "${DB_HOST}" \
  -P "${DB_PORT}" \
  -u "${DB_USER}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  --no-tablespaces \
  "${DB_NAME}" \
  | gzip -6 \
  | age -r "${AGE_PUBLIC_KEY}" -o "${TMP_FILE}"

mv "${TMP_FILE}" "${OUT_FILE}"
chmod 600 "${OUT_FILE}"

FILE_BYTES="$(wc -c < "${OUT_FILE}")"
if [[ "${FILE_BYTES}" -lt 256 ]]; then
  echo "ERROR: File backup quá nhỏ (${FILE_BYTES} bytes), có thể dump thất bại." >&2
  rm -f "${OUT_FILE}"
  exit 1
fi

(cd "${BACKUP_DIR}" && sha256sum "$(basename "${OUT_FILE}")" > "$(basename "${OUT_FILE}").sha256")
chmod 600 "${OUT_FILE}.sha256"

echo "Encrypted backup created: ${OUT_FILE} (${FILE_BYTES} bytes)"

if [[ "${LOCAL_ONLY}" == "true" ]]; then
  echo "LOCAL_ONLY mode: Bỏ qua bước upload Google Drive."
  exit 0
fi

# 2. Upload lên Google Drive (GFS: daily / weekly / monthly)
rclone mkdir "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/daily"
rclone mkdir "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/weekly"
rclone mkdir "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/monthly"

rclone copy "${OUT_FILE}" "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/daily/" --retries 3 --low-level-retries 5
rclone copy "${OUT_FILE}.sha256" "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/daily/" --retries 3

if [[ "$(date +%u)" -eq 7 ]]; then
  rclone copy "${OUT_FILE}" "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/weekly/" --retries 3
fi
if [[ "$(date +%d)" -eq "01" ]]; then
  rclone copy "${OUT_FILE}" "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/monthly/" --retries 3
fi

# 3. GFS retention pruning
rclone delete "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/daily/" --min-age 7d || true
rclone delete "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/weekly/" --min-age 28d || true
rclone delete "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/monthly/" --min-age 180d || true

# Giữ 2 bản gần nhất trên ổ cứng VPS để restore khẩn cấp
ls -1t "${BACKUP_DIR}"/*.sql.gz.age 2>/dev/null | tail -n +3 | while IFS= read -r old; do
  rm -f "${old}" "${old}.sha256"
done

notify_webhook "[WaveLink Backup] OK: $(basename "${OUT_FILE}") (${FILE_BYTES} bytes)"
echo "Backup & Google Drive sync completed successfully."
