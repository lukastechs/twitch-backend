const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// In-memory cache for tokens and follower counts
const cache = {
  token: { value: null, expires: 0 },
  followers: new Map()
};

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

// Generate Twitch App Access Token with caching
async function getTwitchAccessToken() {
  if (cache.token.value && cache.token.expires > Date.now()) {
    console.log('Using cached access token');
    return cache.token.value;
  }

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
    cache.token = {
      value: access_token,
      expires: Date.now() + (expires_in - 300) * 1000 // Expire 5min early
    };
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

// Get follower count with retry
async function getFollowerCount(userId, token, retries = 1) {
  const cacheKey = userId;
  const cached = cache.followers.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    console.log(`Returning cached followers for userId ${userId}: ${cached.followers}`);
    return cached.followers;
  }

  try {
    const response = await axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${userId}&first=1`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });

    const followers = response.data.total || 0;
    cache.followers.set(cacheKey, { followers, timestamp: Date.now() });
    console.log(`Fetched followers for userId ${userId}: ${followers}`);
    return followers;
  } catch (error) {
    console.error('Follower Count Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });

    if (retries > 0 && error.response?.status === 429) {
      console.log('Rate limit hit, retrying after 1s...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getFollowerCount(userId, token, retries - 1);
    }
    console.warn(`Failed to fetch followers for userId ${userId}, returning 0`);
    return 0;
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

    const followers = await getFollowerCount(user.id, token);

    res.json({
      username: user.login,
      nickname: user.display_name,
      estimated_creation_date: new Date(user.created_at).toLocaleDateString(),
      account_age: calculateAccountAge(user.created_at),
      age_days: calculateAgeDays(user.created_at),
      followers,
      total_posts: null, // Not available in Helix API
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
