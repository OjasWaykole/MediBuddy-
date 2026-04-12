// ═══════════════════════════════════════════════════
//  MediBuddy Backend — Enhanced v2.0
//  New: Forgot Password, Payment Recording, Sessions
// ═══════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ── ROUTES ──
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/patient', require('./routes/patient'));
app.use('/api/doctor',  require('./routes/doctor'));
app.use('/api/search',  require('./routes/search'));
app.use('/api/report',  require('./routes/report'));

// NEW: Payment route
app.use('/api/payment', require('./routes/payment'));

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MediBuddy running on http://localhost:${PORT}`));
