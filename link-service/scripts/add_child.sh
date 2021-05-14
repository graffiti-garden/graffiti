#!/usr/bin/env bash

# Usage: add_file.sh parent child

curl -X POST localhost:5000/$1 -H "Content-Type: text/plain" --data $2
echo ""
