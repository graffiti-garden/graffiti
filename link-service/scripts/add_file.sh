#!/usr/bin/env bash

# Usage: add_file.sh file mimetype

curl -X POST localhost:5000 -H "Content-Type: $2" --data-binary @$1
echo ""
