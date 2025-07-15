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

// Generate Twitch App Access Token
async function getTwitchAccessToken() {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Twitch Token Error:', error.response?.data || error.message);
    throw new Error('Failed to generate Twitch access token');
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Twitch Account Age Checker API is running');
});

// Twitch age checker endpoint (POST)
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

    // Get Twitch access token
    const accessToken = await getTwitchAccessToken();

    // Fetch Twitch user data
    const response = await axios.get(
      `https://api.twitch.tv/helix/users?login=${req.params.username}`,
      {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    const user = response.data.data[0];
    if (!user) throw new Error('User not found');

    console.log('Twitch API Response:', JSON.stringify(user, null, 2));

    res.json({
      username: user.login,
      nickname: user.display_name,
      estimated_creation_date: new Date(user.created_at).toLocaleDateString(),
      account_age: calculateAccountAge(user.created_at),
      age_days: calculateAgeDays(user.created_at),
      followers: 0, // Helix API doesn't provide followers directly
      total_posts: 0, // Not available in users endpoint
      verified: user.broadcaster_type === 'partner' ? 'Yes' : 'No',
      description: user.description || 'N/A',
      region: 'N/A', // Twitch API doesn't provide region
      user_id: user.id,
      avatar: user.profile_image_url || 'https://via.placeholder.com/50'
    });
  } catch (error) {
    console.error('Twitch API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Twitch data',
      details: error.response?.data || 'No additional details'
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
