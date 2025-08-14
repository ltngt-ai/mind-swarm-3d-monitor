#!/bin/bash
# Start both Mind Swarm backend and 3D Monitor

echo "🧠 Starting Mind Swarm backend..."
cd ../mind-swarm
./run.sh restart

echo "⏳ Waiting for backend to initialize..."
sleep 3

echo "🎮 Starting 3D Monitor..."
cd ../mind-swarm-3d-monitor
npm run dev