#!/bin/bash

# NectarV Backend Deployment Script
# Usage: npm run deploy

set -e  # Exit on any error

echo "🚀 Starting Backend Deployment..."

# Configuration
PEM_FILE="/Users/mac/nectar.pem"
EC2_HOST="ec2-user@ec2-34-231-243-220.compute-1.amazonaws.com"
REMOTE_PATH="/home/ec2-user/backend"

# Step 1: Push to Git
echo "📤 Pushing to Git..."
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"
git push

echo "✅ Git push successful!"

# Step 2: Pull on server and restart
echo "🔄 Pulling on AWS and restarting..."
ssh -i "$PEM_FILE" "$EC2_HOST" "cd $REMOTE_PATH && git pull && npm install && pm2 restart nectar-backend"

if [ $? -ne 0 ]; then
    echo "❌ Server update failed!"
    exit 1
fi

echo ""
echo "🎉 Backend deployment complete!"
echo "   API should be live now."
