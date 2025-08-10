# Quick Fix for Render Deployment

Since Docker is causing issues, let's switch to Node.js runtime:

## In your Render Dashboard:

1. Go to your service settings
2. Change **Runtime** from "Docker" to "Node"
3. Set **Build Command** to: `npm install && npm run build`
4. Set **Start Command** to: `node dist/app.js`
5. Make sure **Node Version** is set to 20.x
6. Click "Save Changes"

This will trigger a new deployment using Node.js directly instead of Docker.

## Alternative: If you want to keep Docker

Change the **Dockerfile Path** to empty/blank and Render will use the default Node.js buildpack instead.