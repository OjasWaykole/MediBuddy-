const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet } = require('../db/database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'patient', ...extra } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });

    if (!['patient', 'doctor'].includes(role))
      return res.status(400).json({ error: 'Role must be patient or doctor.' });

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role]
    );
    const userId = result.lastID;

    // Create role-specific profile
    if (role === 'patient') {
      const { age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions } = extra;
      await dbRun(
        `INSERT INTO patients (user_id, age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, age || null, gender || null, blood_group || null, phone || null, address || null, emergency_contact || null, allergies || null, chronic_conditions || null]
      );
    } else if (role === 'doctor') {
      const { specialization, qualification, experience_years, hospital, consultation_fee, available_days, available_time, diseases_treated, bio, phone } = extra;
      await dbRun(
        `INSERT INTO doctors (user_id, specialization, qualification, experience_years, hospital, consultation_fee, available_days, available_time, diseases_treated, bio, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, specialization || '', qualification || '', experience_years || 0, hospital || '', consultation_fee || 0, available_days || 'Mon,Tue,Wed,Thu,Fri', available_time || '09:00-17:00', diseases_treated || '', bio || '', phone || null]
      );
    }

    const token = jwt.sign({ id: userId, email, name, role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Registration successful', token, user: { id: userId, name, email, role } });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });

  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// GET /api/auth/me - get current user info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
