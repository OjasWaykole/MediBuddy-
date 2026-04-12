// routes/auth.js — Enhanced with Forgot Password & Session Logging
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const auth = require('../middleware/auth');
const SECRET = process.env.JWT_SECRET || 'medibuddy_secret_2024';

// ── REGISTER ──
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, age, gender, blood_group, phone, address,
            emergency_contact, allergies, chronic_conditions,
            specialization, qualification, experience_years, hospital,
            consultation_fee, available_days, available_time, diseases_treated, bio } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: 'Missing required fields' });
    const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role]
    );
    const userId = user.lastID;
    if (role === 'patient') {
      await db.run(
        `INSERT INTO patients (user_id, age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, age||null, gender||null, blood_group||null, phone||null, address||null,
         emergency_contact||null, allergies||null, chronic_conditions||null]
      );
    } else if (role === 'doctor') {
      await db.run(
        `INSERT INTO doctors (user_id, specialization, qualification, experience_years, hospital,
         consultation_fee, available_days, available_time, diseases_treated, bio, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, specialization||null, qualification||null, experience_years||null, hospital||null,
         consultation_fee||null, available_days||null, available_time||null, diseases_treated||null,
         bio||null, phone||null]
      );
    }
    res.status(201).json({ message: 'Account created successfully' });
  } catch(e) {
    console.error('Register error:', e);
    res.status(500).json({ message: 'Registration failed', error: e.message });
  }
});

// ── LOGIN with Session Logging ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password' });
    // Log session
    await db.run(
      'INSERT INTO sessions (user_id, event, created_at) VALUES (?, ?, datetime("now"))',
      [user.id, 'login']
    ).catch(() => {}); // Don't fail if table doesn't exist yet
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch(e) {
    console.error('Login error:', e);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ── GET CURRENT USER ──
router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch(e) { res.status(500).json({ message: 'Error fetching user' }); }
});

// ── LOGOUT with Session Logging ──
router.post('/logout', auth, async (req, res) => {
  try {
    await db.run(
      'INSERT INTO sessions (user_id, event, created_at) VALUES (?, ?, datetime("now"))',
      [req.user.id, 'logout']
    ).catch(() => {});
    res.json({ message: 'Logged out successfully' });
  } catch(e) { res.json({ message: 'Logged out' }); }
});

// ── FORGOT PASSWORD ──
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await db.get('SELECT id, name, email FROM users WHERE email = ?', [email]);
    // Always respond success to prevent email enumeration
    if (user) {
      const resetToken = jwt.sign({ id: user.id, type: 'reset' }, SECRET, { expiresIn: '1h' });
      // Store reset token (in production: email this link)
      await db.run(
        'INSERT OR REPLACE INTO password_resets (user_id, token, expires_at) VALUES (?, ?, datetime("now", "+1 hour"))',
        [user.id, resetToken]
      ).catch(() => {
        console.log('Password reset token (would be emailed):', resetToken);
      });
      console.log(`Password reset link for ${email}: /reset-password?token=${resetToken}`);
    }
    res.json({ message: `If an account exists for ${email}, a reset link has been sent.` });
  } catch(e) { res.status(500).json({ message: 'Error processing request' }); }
});

// ── RESET PASSWORD ──
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ message: 'Token and new password required' });
    const decoded = jwt.verify(token, SECRET);
    if (decoded.type !== 'reset') return res.status(400).json({ message: 'Invalid token' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, decoded.id]);
    res.json({ message: 'Password reset successfully' });
  } catch(e) { res.status(400).json({ message: 'Invalid or expired token' }); }
});

// ── CHANGE PASSWORD (authenticated) ──
router.put('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch(e) { res.status(500).json({ message: 'Error changing password' }); }
});

// ── SESSION HISTORY ──
router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await db.all(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ sessions });
  } catch(e) { res.json({ sessions: [] }); }
});

module.exports = router;
