#!/bin/sh
set -e

echo "Running database migrations..."
# Retry migrations up to 5 times (postgres might still be warming up)
attempt=1
max_attempts=5
until node dist/database/migrate.js; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Migrations failed after $max_attempts attempts"
    exit 1
  fi
  echo "Migration attempt $attempt failed, retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done

echo "Starting Euphoria API..."
exec node dist/main.js
