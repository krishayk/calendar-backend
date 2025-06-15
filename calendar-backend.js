const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const calendar = google.calendar('v3');
const key = require('./service-account.json'); // Place your service account JSON in the same directory
const session = require('express-session');
const cookieSession = require('cookie-session');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const app = express();

// Configure CORS with credentials
app.use(cors({
  origin: 'https://eastbay-tutoring-scheduler.vercel.app',
  credentials: true
}));

app.use(express.json());

// Configure cookie-session
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'your-session-secret'],
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  sameSite: 'none',
  secure: true
}));

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://calendar-backend-tejy.onrender.com/auth/google/callback'
);

// Google OAuth routes
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store tokens in session
    req.session.tokens = tokens;
    
    // Redirect back to frontend
    res.redirect('https://eastbay-tutoring-scheduler.vercel.app');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect('https://eastbay-tutoring-scheduler.vercel.app?error=auth_failed');
  }
});

// Check auth status
app.get('/api/check-auth', (req, res) => {
  const tokens = req.session.tokens;
  if (!tokens) {
    return res.json({ authenticated: false });
  }
  
  // Check if token is expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    return res.json({ authenticated: false });
  }
  
  res.json({ authenticated: true });
});

// Middleware to check OAuth authentication
const checkAuth = (req, res, next) => {
  const tokens = req.session.tokens;
  if (!tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Check if token is expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  oauth2Client.setCredentials(tokens);
  next();
};

// Protected routes
app.post('/api/create-event', checkAuth, async (req, res) => {
  try {
    const { summary, description, start, end, attendees } = req.body;

    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'America/Los_Angeles' },
      end: { dateTime: end, timeZone: 'America/Los_Angeles' },
      conferenceData: {
        createRequest: { requestId: Math.random().toString(36).substring(2) }
      },
      attendees: attendees.map(email => ({ email }))
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

app.post('/api/generate-meet-link', checkAuth, async (req, res) => {
  try {
    const { lesson } = req.body;

    const event = {
      summary: `${lesson.course} with ${lesson.child}`,
      description: `Tutoring session for ${lesson.child} (Grade ${lesson.grade})`,
      start: { dateTime: lesson.date, timeZone: 'America/Los_Angeles' },
      end: { dateTime: new Date(new Date(lesson.date).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'America/Los_Angeles' },
      conferenceData: {
        createRequest: { requestId: Math.random().toString(36).substring(2) }
      },
      attendees: [
        { email: lesson.parentEmail || '' },
        { email: lesson.tutorEmail || '' },
        ...(lesson.childEmail ? [{ email: lesson.childEmail }] : [])
      ]
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

// Logout route
app.get('/auth/logout', (req, res) => {
  req.session = null;
  res.redirect('https://eastbay-tutoring-scheduler.vercel.app');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 