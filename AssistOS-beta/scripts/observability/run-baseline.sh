#!/bin/bash
# Performance Baseline Runner (Sprint 1 Gap 3)
# Alternative to npm script (until package.json can be updated)
#
# Usage: ./scripts/observability/run-baseline.sh

echo "Running AssistOS Performance Baseline..."
tsx scripts/observability/perf-baseline.ts
