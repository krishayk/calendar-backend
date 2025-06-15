const express = require('express');
const cors = require('cors');
const session = require('cookie-session');
const { google } = require('googleapis');
const calendar = google.calendar('v3');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS: Allow Vercel frontend and local dev
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://eastbay-tutoring-scheduler.vercel.app'
  ],
  credentials: true
}));

// Session middleware
app.use(session({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'your-session-secret'],
  maxAge: 24 * 60 * 60 * 1000 // 1 day
}));

// Google OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g. https://calendar-backend-xxxx.onrender.com/auth/google/callback
);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// --- OAuth2 Endpoints ---

app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.redirect('https://eastbay-tutoring-scheduler.vercel.app'); // Redirect to your frontend
  } catch (err) {
    console.error(err);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.tokens });
});

// --- Event Creation with OAuth2 ---

app.post('/api/create-event-oauth', async (req, res) => {
  try {
    if (!req.session.tokens) return res.status(401).json({ error: 'Not authenticated' });
    oauth2Client.setCredentials(req.session.tokens);

    const { summary, description, start, end, attendees } = req.body;
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
      auth: oauth2Client,
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

// --- Generate Meet Link for Tutors (reuse OAuth2 logic) ---

app.post('/api/generate-meet-link', async (req, res) => {
  try {
    if (!req.session.tokens) return res.status(401).json({ error: 'Not authenticated' });
    oauth2Client.setCredentials(req.session.tokens);

    const { lesson } = req.body;
    const event = {
      summary: `${lesson.course} with ${lesson.child}`,
      description: `Tutoring session for ${lesson.child} (Grade ${lesson.grade})`,
      start: { dateTime: lesson.date, timeZone: 'America/Los_Angeles' },
      end: { dateTime: new Date(new Date(lesson.date).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'America/Los_Angeles' },
      attendees: [
        { email: lesson.parentEmail || '' },
        { email: lesson.tutorEmail || '' },
        ...(lesson.childEmail ? [{ email: lesson.childEmail }] : [])
      ],
      conferenceData: {
        createRequest: { requestId: Math.random().toString(36).substring(2) }
      }
    };

    const response = await calendar.events.insert({
      auth: oauth2Client,
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
    res.status(500).json({ error: 'Failed to generate Meet link' });
  }
});

// --- Start Server ---

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));