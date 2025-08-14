#!/bin/bash
# Run TypeScript type checking

echo "🔍 Running TypeScript type checking..."
npx tsc --noEmit

if [ $? -eq 0 ]; then
    echo "✅ No type errors found!"
else
    echo "❌ Type errors detected. Please fix them before proceeding."
    exit 1
fi