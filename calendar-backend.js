const express = require('express');
const cors = require('cors');
const cookieSession = require('cookie-session');

const app = express();

app.use(cors({
  origin: ['https://eastbay-tutoring-scheduler.vercel.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json());

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'your-session-secret'],
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  sameSite: 'none',
  secure: true,
  httpOnly: true,
  path: '/'
}));

// Example in-memory bookings (replace with DB in production)
let bookings = [];

// Get all bookings
app.get('/api/bookings', (req, res) => {
  res.json(bookings);
});

// Create a new booking
app.post('/api/bookings', (req, res) => {
  const booking = { ...req.body, id: Date.now().toString() };
  bookings.push(booking);
  res.status(201).json(booking);
});

// Update a booking (e.g., to add/edit meetLink)
app.put('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  bookings[idx] = { ...bookings[idx], ...req.body };
  res.json(bookings[idx]);
});

// Delete a booking
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  bookings = bookings.filter(b => b.id !== id);
  res.status(204).end();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 