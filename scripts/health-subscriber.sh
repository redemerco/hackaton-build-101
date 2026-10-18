#!/usr/bin/env bash
# Suscriptor de webhooks de Google Health (nivel proyecto) → POST /api/webhooks/health.
# Doc: https://developers.google.com/health/webhooks
#
# Uso:
#   HEALTH_PROJECT_NUMBER=123456789012 HEALTH_WEBHOOK_SECRET='Bearer <secreto>' \
#     scripts/health-subscriber.sh create|update|list|get|delete
#
# Env:
#   HEALTH_PROJECT_NUMBER  NÚMERO del proyecto GCP (no el id: con el id la API da 400/403).
#                          gcloud projects describe <id> --format='value(projectNumber)'
#   HEALTH_WEBHOOK_SECRET  valor exacto del header Authorization (con "Bearer "); igual al del .env.local del server.
#                          Solo hace falta para create/update.
#   HEALTH_SUBSCRIBER_ID   default pulso-webhook (4-36 chars, [a-z][a-z0-9-]{2,34}[a-z0-9])
#   HEALTH_ENDPOINT        URL pública del webhook (solo create/update). Sin default: si falta, se arma con APP_URL (el origen público,
#                          el mismo del server) + /api/webhooks/health; sin ninguna de las dos, falla.
#   HEALTH_API_BASE        default https://health.googleapis.com/v4 (igual que el server, lib/config.ts)
#   GCLOUD_CONFIG          configuración de gcloud a usar (ej. build101); vacío = la activa.
#
# create/update son síncronos con la verificación: Google manda 2 POST {"type":"verification"}
# (con y sin Authorization) al endpoint, así que el server ya tiene que estar arriba con el secreto cargado.
set -euo pipefail

cmd="${1:-}"
: "${HEALTH_PROJECT_NUMBER:?falta HEALTH_PROJECT_NUMBER (número del proyecto GCP)}"
SUB_ID="${HEALTH_SUBSCRIBER_ID:-pulso-webhook}"
# Los dataTypes que ingesta lib/sources/google.ts (TYPES): si se agrega uno ahí, agregarlo acá y correr update.
DATA_TYPES='["sleep","daily-resting-heart-rate","daily-heart-rate-variability","active-zone-minutes"]'
API_BASE="${HEALTH_API_BASE:-https://health.googleapis.com/v4}"
BASE="${API_BASE%/}/projects/${HEALTH_PROJECT_NUMBER}/subscribers"

gc=(gcloud)
[[ -n "${GCLOUD_CONFIG:-}" ]] && gc+=("--configuration=${GCLOUD_CONFIG}")
TOKEN="$("${gc[@]}" auth print-access-token)"

body() {
  : "${HEALTH_WEBHOOK_SECRET:?falta HEALTH_WEBHOOK_SECRET (ej. 'Bearer <random>')}"
  local ENDPOINT
  if [[ -n "${HEALTH_ENDPOINT:-}" ]]; then ENDPOINT="$HEALTH_ENDPOINT"
  elif [[ -n "${APP_URL:-}" ]]; then ENDPOINT="${APP_URL%/}/api/webhooks/health"
  else echo "falta HEALTH_ENDPOINT (o APP_URL con el origen público del server)" >&2; exit 2; fi
  ENDPOINT="$ENDPOINT" DATA_TYPES="$DATA_TYPES" python3 -c '
import json, os
print(json.dumps({
  "endpointUri": os.environ["ENDPOINT"],
  "subscriberConfigs": [{"dataTypes": json.loads(os.environ["DATA_TYPES"]), "subscriptionCreatePolicy": "AUTOMATIC"}],
  "endpointAuthorization": {"secret": os.environ["HEALTH_WEBHOOK_SECRET"]},
}))'
}

api() { # método url [body]
  local args=(-sS -X "$1" "$2" -H "Authorization: Bearer ${TOKEN}" -H "x-goog-user-project: ${HEALTH_PROJECT_NUMBER}")
  [[ $# -ge 3 ]] && args+=(-H "Content-Type: application/json" --data-binary "$3")
  curl "${args[@]}" -w '\nHTTP %{http_code}\n'
}

case "$cmd" in
  # body va en una asignación aparte: así set -e corta si falta el secreto o el endpoint.
  create) b="$(body)"; api POST "${BASE}?subscriberId=${SUB_ID}" "$b" ;;
  # subscriberConfigs se reemplaza entero (no merge).
  update) b="$(body)"; api PATCH "${BASE}/${SUB_ID}?updateMask=endpointUri,subscriberConfigs,endpointAuthorization" "$b" ;;
  list) api GET "${BASE}" ;;
  get) api GET "${BASE}/${SUB_ID}" ;;
  delete) api DELETE "${BASE}/${SUB_ID}" ;;
  *) echo "uso: $0 create|update|list|get|delete" >&2; exit 2 ;;
esac
