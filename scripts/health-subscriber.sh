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
#   HEALTH_ENDPOINT        default https://pulso.renzodemarco.com.uy/api/webhooks/health
#   GCLOUD_CONFIG          configuración de gcloud a usar (ej. build101); vacío = la activa.
#
# create/update son síncronos con la verificación: Google manda 2 POST {"type":"verification"}
# (con y sin Authorization) al endpoint, así que el server ya tiene que estar arriba con el secreto cargado.
set -euo pipefail

cmd="${1:-}"
: "${HEALTH_PROJECT_NUMBER:?falta HEALTH_PROJECT_NUMBER (número del proyecto GCP)}"
SUB_ID="${HEALTH_SUBSCRIBER_ID:-pulso-webhook}"
ENDPOINT="${HEALTH_ENDPOINT:-https://pulso.renzodemarco.com.uy/api/webhooks/health}"
# Los dataTypes que ingesta lib/sources/google.ts (TYPES): si se agrega uno ahí, agregarlo acá y correr update.
DATA_TYPES='["sleep","daily-resting-heart-rate","daily-heart-rate-variability","active-zone-minutes"]'
BASE="https://health.googleapis.com/v4/projects/${HEALTH_PROJECT_NUMBER}/subscribers"

gc=(gcloud)
[[ -n "${GCLOUD_CONFIG:-}" ]] && gc+=("--configuration=${GCLOUD_CONFIG}")
TOKEN="$("${gc[@]}" auth print-access-token)"

body() {
  : "${HEALTH_WEBHOOK_SECRET:?falta HEALTH_WEBHOOK_SECRET (ej. 'Bearer <random>')}"
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
  create) api POST "${BASE}?subscriberId=${SUB_ID}" "$(body)" ;;
  # subscriberConfigs se reemplaza entero (no merge).
  update) api PATCH "${BASE}/${SUB_ID}?updateMask=endpointUri,subscriberConfigs,endpointAuthorization" "$(body)" ;;
  list) api GET "${BASE}" ;;
  get) api GET "${BASE}/${SUB_ID}" ;;
  delete) api DELETE "${BASE}/${SUB_ID}" ;;
  *) echo "uso: $0 create|update|list|get|delete" >&2; exit 2 ;;
esac
