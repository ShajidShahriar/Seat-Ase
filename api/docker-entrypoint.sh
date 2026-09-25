#!/bin/sh
set -e

# ---- Tables first, then the base world (every seed is safe to re-run) ----

node src/db/migrate.js
node src/db/seed/dhaka.js
node src/db/seed/drivers.js
node src/db/seed/passengers.js

# ---- Hand PID 1 to the server so SIGTERM reaches its shutdown handler ----

exec node src/server.js
