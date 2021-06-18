#!/bin/sh

SERVER=localhost:8080

curl -d "{\"title\":\"$1\",\"text\":\"$2\"}" $SERVER/narratives --header "Content-Type: application/json"
