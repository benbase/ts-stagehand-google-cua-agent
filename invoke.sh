#!/bin/bash

# Usage: ./invoke.sh <task-name>
# Example: ./invoke.sh kaiser
# This will download the configured document (invoice, report, renewal, etc.)

if [ -z "$1" ]; then
    echo "Usage: ./invoke.sh <task-name>"
    echo "Example: ./invoke.sh kaiser"
    exit 1
fi

TASK_NAME=$1

# Prepare download payload by merging credentials with task config
PAYLOAD=$(npx tsx prepare-payload.ts "$TASK_NAME")

if [ $? -ne 0 ]; then
    echo "Failed to prepare download payload for task: $TASK_NAME"
    exit 1
fi

echo "Invoking download task: $TASK_NAME"
kernel invoke --payload "$PAYLOAD" ts-stagehand-bb download-task
