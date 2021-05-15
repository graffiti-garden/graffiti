#!/usr/bin/env bash

# Usage: ./add_child.sh parent_address child_address

curl -X POST localhost:5000/$1 -H "Content-Type: text/plain" --data $2
echo ""
