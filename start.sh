#!/bin/bash

echo "🌐 Mind-Swarm 3D Monitor"
echo "======================"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if Mind-Swarm server is running
if ! curl -s http://localhost:8888/ > /dev/null 2>&1; then
    echo "⚠️  Warning: Mind-Swarm server doesn't appear to be running on port 8888"
    echo "   Start it with: cd ../mind-swarm && ./run.sh server"
    echo ""
fi

echo "🚀 Starting 3D monitor on http://localhost:5175"
echo "   Click and drag to rotate camera"
echo "   Scroll to zoom"
echo ""
npm run dev