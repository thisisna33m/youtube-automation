import { google } from 'googleapis';
import dotenv from 'dotenv';
import express from 'express';
import { CronJob } from 'cron';
import open from 'open';
import fs from 'fs'; // Import fs to manipulate files

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

const updateVideo = async () => {
  oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });

  try {
    const result = await youtube.videos.list({
      id: 'aS03GmqcmNY', // Replace with your video ID
      part: 'statistics,snippet',
    });

    if (result.data.items.length > 0) {
      const stats = result.data.items[0].statistics;

      await youtube.videos.update({
        part: 'snippet',
        requestBody: {
          id: '1TvqQrGRyB8', // Replace with your video ID
          snippet: {
            title: `This video has ${stats.viewCount} views`,
            categoryId: '24',
          },
        },
      });
      console.log(`Updated video title to: This video has ${stats.viewCount} views`);
    }
  } catch (error) {
    console.error("Error updating video:", error);
  }
};

const generateAuthUrl = () => {
  const scopes = ["https://www.googleapis.com/auth/youtube.force-ssl"];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
  return url;
};

const handleAuth = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  console.log('Tokens acquired:', tokens);

  // Store the refresh token in your .env file
  storeRefreshToken(tokens.refresh_token);
};

const storeRefreshToken = (refreshToken) => {
  const envFilePath = './.env'; // Adjust the path if needed
  const currentEnv = fs.readFileSync(envFilePath, 'utf8');
  
  // Check if refresh token already exists
  if (currentEnv.includes('REFRESH_TOKEN=')) {
    // Replace existing refresh token
    const updatedEnv = currentEnv.replace(/REFRESH_TOKEN=.*/, `REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(envFilePath, updatedEnv);
  } else {
    // Add new refresh token
    fs.appendFileSync(envFilePath, `\nREFRESH_TOKEN=${refreshToken}`);
  }
};

const startOAuthFlow = async () => {
  const url = generateAuthUrl();
  console.log("Authorization URL:", url);
  await open(url);
};

const init = async () => {
  if (!process.env.REFRESH_TOKEN) {
    // If no refresh token, start the OAuth flow
    await startOAuthFlow();

    // Start an Express server to handle the callback
    app.get('/callback', async (req, res) => {
      const { code } = req.query; // Get the authorization code
      if (code) {
        await handleAuth(code);
        console.log("code", code);
        res.send('Authorization complete! You can close this window.');
        // Start the periodic update after authorization
        updateEvery8Mins.start();
      }
    });

    app.listen(port, () => {
      console.log(`OAuth server running on http://localhost:${port}`);
    });
  } else {
    // If refresh token exists, start the periodic update directly
    console.log('Using existing refresh token.');
    updateEvery8Mins.start();
  }
};

// Schedule the update every 8 minutes
const updateEvery8Mins = new CronJob('*/10 * * * * *', async () => {
  await updateVideo();
});

// Initialize the app
init();
