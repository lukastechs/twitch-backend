const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Twitch age checker endpoint
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

    const response = await axios.get(`https://api.twitch.tv/helix/users?login=${req.params.username}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    const user = response.data.data[0];
    if (!user) throw new Error('User not found');
    res.json({
      username: user.login,
      created_at: user.created_at,
      followers: user.followers_count || 0, // Note: May need separate API call for followers
      bio: user.description || 'N/A',
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch Twitch data',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Twitch Server running on port ${PORT}`);
});
