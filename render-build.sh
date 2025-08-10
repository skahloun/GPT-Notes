#!/usr/bin/env bash
# Build script for Render
set -e

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "Checking dist directory..."
ls -la dist/

echo "Build completed successfully!"