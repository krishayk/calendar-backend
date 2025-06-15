const express = require('express');
const { google } = require('googleapis');
const session = require('cookie-session');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://eastbay-tutoring-scheduler.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(session({
  name: 'session',
  keys: ['your_secret_key'],
  maxAge: 24 * 60 * 60 * 1000
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Step 1: Start OAuth2 flow
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(url);
});

// Step 2: Handle OAuth2 callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    // Redirect to frontend after login
    res.redirect('https://eastbay-tutoring-scheduler.vercel.app/');
  } catch (err) {
    res.status(500).send('Authentication failed');
  }
});

// Step 3: Create event on tutor's calendar, invite parent/student, add Meet link
app.post('/api/create-event-oauth', async (req, res) => {
  if (!req.session.tokens) return res.status(401).json({ error: 'Not authenticated' });
  oauth2Client.setCredentials(req.session.tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const { summary, description, start, end, attendees } = req.body;

  try {
    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'America/Los_Angeles' },
      end: { dateTime: end, timeZone: 'America/Los_Angeles' },
      attendees: attendees.map(email => ({ email })),
      conferenceData: {
        createRequest: { requestId: Math.random().toString(36).substring(2) }
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    res.json({
      eventLink: response.data.htmlLink,
      meetLink: response.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Utility: Check if tutor is authenticated
app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.tokens });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
