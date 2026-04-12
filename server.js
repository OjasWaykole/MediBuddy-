const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/database');

// Route imports
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const searchRoutes = require('./routes/search');
const reportRoutes = require('./routes/report');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/reports', express.static(path.join(__dirname, 'generated_reports')));

// Initialize DB then start server
initDB().then(() => {
  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/report', reportRoutes);

  // Health check
  app.get('/', (req, res) => {
    res.json({ message: 'MediBuddy API is running 🏥', version: '1.0.0' });
  });

  app.listen(PORT, () => {
    console.log(`\n🏥 MediBuddy Backend running on http://localhost:${PORT}`);
    console.log(`📋 API Docs available at http://localhost:${PORT}/api-info\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;
