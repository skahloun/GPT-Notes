# 🚀 Deploying to Render

This guide will help you deploy the Class Notes PWA to Render.

## Prerequisites

- GitHub account with the repository
- Render account (free tier works)
- AWS credentials for Transcribe
- OpenAI API key
- Google OAuth credentials (optional)

## Step-by-Step Deployment

### 1. Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub account if not already connected
4. Select the `skahloun/GPT-Notes` repository
5. Configure the service:
   - **Name**: `class-notes-pwa` (or your preferred name)
   - **Region**: Oregon (US West) or nearest to you
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/app.js`
   - **Plan**: Free (or Starter for production)

### 2. Add Environment Variables

Click on **Environment** tab and add these variables:

#### Required Variables:
```
NODE_ENV=production
JWT_SECRET=<click-generate-to-create-secure-key>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<click-generate-to-create-secure-password>

# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>

# OpenAI
OPENAI_API_KEY=<your-openai-api-key>

# Optional: Google OAuth (update after getting URL)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://<your-app-name>.onrender.com/auth/google/callback
```

### 3. Create PostgreSQL Database

1. Go to **New +** → **PostgreSQL**
2. Configure:
   - **Name**: `class-notes-db`
   - **Database**: `classnotes`
   - **User**: `classnotes`
   - **Region**: Same as your web service
   - **Plan**: Free
3. Create the database
4. Once created, it will automatically be linked to your web service

### 4. Deploy

1. Click **Manual Deploy** → **Deploy latest commit**
2. Watch the build logs
3. Once deployed, you'll get a URL like: `https://class-notes-pwa.onrender.com`

### 5. Update Google OAuth (if using)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Update your OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-app-name.onrender.com/auth/google/callback`
4. Update the `GOOGLE_REDIRECT_URI` environment variable in Render

### 6. Test Your Deployment

1. Visit your app URL
2. Create a test account
3. Try recording a short audio clip
4. Access admin panel at `/admin`

## Important Notes

### WebSocket Limitations

Render's free tier has a 5-minute timeout for HTTP requests. For long recordings:
- Consider upgrading to a paid plan
- Or implement chunked recording (save every 4 minutes)

### Custom Domain

To add a custom domain:
1. Go to **Settings** → **Custom Domains**
2. Add your domain
3. Update DNS records as instructed

### Monitoring

- Check **Logs** tab for real-time logs
- Use **Metrics** tab for performance monitoring
- Set up **Notifications** for deploy status

## Troubleshooting

### Database Connection Issues
- Ensure the DATABASE_URL is automatically set by Render
- Check if the database is in the same region

### Audio Recording Not Working
- Ensure HTTPS is enabled (automatic on Render)
- Check browser console for permission errors
- Verify AWS credentials are correct

### Admin Login Issues
- Double-check ADMIN_USERNAME and ADMIN_PASSWORD in environment variables
- Try clearing browser cookies

### Build Failures
- Check build logs for specific errors
- Ensure all dependencies are in package.json
- Try clearing build cache in Render settings

## Cost Considerations

- **Free Tier**: 750 hours/month, spins down after 15 mins of inactivity
- **Starter**: $7/month, always on, better for production
- **Database**: Free tier includes 1GB storage

## Next Steps

1. Set up monitoring alerts
2. Configure auto-scaling (paid plans)
3. Implement backup strategy
4. Add custom domain
5. Enable Render's DDoS protection

Happy deploying! 🎉