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
    all)
        deploy_app "driver"
        deploy_app "navigator"
        ;;
    *)
        echo "Usage: $0 [driver|navigator|all]"
        echo "  driver    - Deploy only the driver app (Stagehand-based)"
        echo "  navigator - Deploy only the navigator app (Computer Controls)"
        echo "  all       - Deploy both apps (default)"
        exit 1
        ;;
esac
