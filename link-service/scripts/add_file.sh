#!/usr/bin/env bash

# Usage: ./add_file.sh file parent1 parent2 ...

parents=""
for parent in ${@:2}
do
  parents="${parents} -F \"parents=${parent}\""
done
eval "curl localhost:5000 -F \"data=@$1\"$parents"
echo ""
