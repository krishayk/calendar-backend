const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const calendar = google.calendar('v3');
const key = require('./service-account.json'); // Place your service account JSON in the same directory

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/create-event', async (req, res) => {
  try {
    const { summary, description, start, end, attendees } = req.body;

    const jwtClient = new google.auth.JWT(
      key.client_email,
      null,
      key.private_key,
      SCOPES
    );
    await jwtClient.authorize();

    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'America/Los_Angeles' },
      end: { dateTime: end, timeZone: 'America/Los_Angeles' },
      conferenceData: {
        createRequest: { requestId: Math.random().toString(36).substring(2) }
      }
    };

    const response = await calendar.events.insert({
      auth: jwtClient,
      calendarId: 'primary', // or your calendar's ID
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
