const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Calculate account age in human-readable format
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return years > 0 ? `${years} years, ${months} months` : `${months} months`;
}

// Calculate age in days
function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Twitch Account Age Checker API is running');
});

// Twitch age checker endpoint (POST for frontend with reCAPTCHA)
app.post('/api/twitch/:username', async (req, res) => {
  try {
    // Verify reCAPTCHA
    const recaptchaResponse = req.body.recaptcha;
    if (!recaptchaResponse) {
      return res.status(400).json({ error: 'reCAPTCHA required' });
    }
    const recaptchaVerify = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaResponse,
      })
    );
    if (!recaptchaVerify.data.success) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }

    // Get Twitch App Access Token
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    });
    const token = tokenResponse.data.access_token;

    // Get user data
    const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${req.params.username}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    const user = userResponse.data.data[0];
    if (!user) throw new Error('User not found');

    // Get followers count
    let followers = 0;
    const followersResponse = await axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${user.id}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    followers = followersResponse.data.total || 0;

    res.json({
      username: user.login,
      nickname: user.display_name,
      estimated_creation_date: new Date(user.created_at).toLocaleDateString(),
      account_age: calculateAccountAge(user.created_at),
      age_days: calculateAgeDays(user.created_at),
      followers: followers,
      total_likes: 'N/A',
      verified: user.broadcaster_type ? user.broadcaster_type.charAt(0).toUpperCase() + user.broadcaster_type.slice(1) : 'No',
      description: user.description || 'N/A',
      region: 'N/A',
      user_id: user.id,
      avatar: user.profile_image_url || 'https://via.placeholder.com/50',
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Twitch data',
    });
  }
});

// Twitch age checker endpoint (GET for testing, no reCAPTCHA)
app.get('/api/twitch/:username', async (req, res) => {
  try {
    // Get Twitch App Access Token
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    });
    const token = tokenResponse.data.access_token;

    // Get user data
    const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${req.params.username}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    const user = userResponse.data.data[0];
    if (!user) throw new Error('User not found');

    // Get followers count
    let followers = 0;
    const followersResponse = await axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${user.id}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    followers = followersResponse.data.total || 0;

    res.json({
      username: user.login,
      nickname: user.display_name,
      estimated_creation_date: new Date(user.created_at).toLocaleDateString(),
      account_age: calculateAccountAge(user.created_at),
      age_days: calculateAgeDays(user.created_at),
      followers: followers,
      total_likes: 'N/A',
      verified: user.broadcaster_type ? user.broadcaster_type.charAt(0).toUpperCase() + user.broadcaster_type.slice(1) : 'No',
      description: user.description || 'N/A',
      region: 'N/A',
      user_id: user.id,
      avatar: user.profile_image_url || 'https://via.placeholder.com/50',
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Twitch data',
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Twitch Server running on port ${PORT}`);
});
