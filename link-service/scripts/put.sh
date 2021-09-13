#!/usr/bin/env bash

# Usage: ./put.sh url file token

curl localhost:5000/$1 -F data=@$2 -F token=$3
