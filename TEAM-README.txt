ZKHealthPass - Startup Guide (After Environment Reset)

Quick start (both A and B):
1. ~/ZK/start_all.sh  (starts PG + Fabric + ccaas + backend)
2. cd ~/ZK/frontend && npm run dev  (starts Vite on :5173)

If you see ECONNREFUSED:
- Login/auth errors usually mean PostgreSQL is down → run step 1 again
- Chaincode/endorsement errors usually mean Fabric/ccaas down → run step 1 again
- Backend is already running and will auto-reconnect once PG is up

Scripts:
- ~/ZK/start_all.sh   (infra + backend)
- ~/ZK/start_stack.sh (infra only)
