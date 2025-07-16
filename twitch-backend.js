const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000
    });

    const { access_token, expires_in } = response.data;
    console.log('Fetched new access token');
    return access_token;
  } catch (error) {
    console.error('Twitch Token Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error('Failed to generate Twitch access token');
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Twitch Account Age Checker API is running');
});

// Twitch age checker endpoint (GET)
app.get('/api/twitch/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const token = await getTwitchAccessToken();
    const response = await axios.get(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });

    const user = response.data.data[0];
    if (!user) {
      return res.status(404).json({ error: `User ${username} not found` });
    }

    res.json({
      username: user.login,
      nickname: user.display_name,
      estimated_creation_date: new Date(user.created_at).toLocaleDateString(),
      account_age: calculateAccountAge(user.created_at),
      age_days: calculateAgeDays(user.created_at),
      followers: "Available on App", // Removed due to deprecated /helix/users/follows endpoint
      total_posts: "Unavailable", // Not available in Helix API
      verified: user.broadcaster_type === 'partner' || user.broadcaster_type === 'affiliate' ? 'Yes' : 'No',
      description: user.description || 'N/A',
      region: 'N/A', // No region data in Helix API
      user_id: user.id,
      avatar: user.profile_image_url || 'https://via.placeholder.com/50',
      estimation_confidence: 'High',
      accuracy_range: 'Exact'
    });
  } catch (error) {
    console.error('Twitch API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
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

app.listen(port, () => {
  console.log(`Twitch Server running on port ${port}`);
});

/* 
// Optional: Use GET /helix/channels/followers with user access token
// Requires OAuth Authorization Code Flow with moderator:read:follows scope
async function getFollowerCount(userId, token) {
  try {
    const response = await axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}&first=1`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}` // Must be user access token
      },
      timeout: 5000
    });

    const followers = response.data.total || 0;
    console.log(`Fetched followers for userId ${userId}: ${followers}`);
    return followers;
  } catch (error) {
    console.error('Follower Count Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return null;
  }
}
*/
