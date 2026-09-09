#!/usr/bin/env bash
set -e
for f in js/*.js; do node --check "$f" >/dev/null; done
echo "Campus Connect JS syntax: PASS"
