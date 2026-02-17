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
    navigator)
        deploy_app "navigator"
        ;;
    navigator-dev)
        deploy_app "navigator-dev"
        ;;
    navigator-stg)
        deploy_app "navigator-stg"
        ;;
    all)
        deploy_app "navigator"
        deploy_app "navigator-dev"
        deploy_app "navigator-stg"
        ;;
    *)
        echo "Usage: $0 [navigator|navigator-dev|navigator-stg|all]"
        echo "  navigator     - Deploy only the navigator app (Computer Controls)"
        echo "  navigator-dev - Deploy only the navigator dev app"
        echo "  navigator-stg - Deploy only the navigator staging app"
        echo "  all           - Deploy all apps (default)"
        exit 1
        ;;
esac
