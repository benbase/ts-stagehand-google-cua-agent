#!/bin/bash

set -e

APPS_DIR="apps"
ENV_FILE=".env"

deploy_app() {
    local app=$1
    echo "Deploying $app..."
    kernel deploy "$APPS_DIR/$app/index.ts" --env-file "$ENV_FILE"
    echo "$app deployed successfully"
}

case "${1:-all}" in
    driver)
        deploy_app "driver"
        ;;
    navigator)
        deploy_app "navigator"
        ;;
    old)
        deploy_app "old"
        ;;
    all)
        deploy_app "driver"
        deploy_app "navigator"
        deploy_app "old"
        ;;
    *)
        echo "Usage: $0 [driver|navigator|old|all]"
        echo "  driver    - Deploy only the driver app (Stagehand-based)"
        echo "  navigator - Deploy only the navigator app (Computer Controls)"
        echo "  old       - Deploy only the old app (Legacy Stagehand)"
        echo "  all       - Deploy all apps (default)"
        exit 1
        ;;
esac
