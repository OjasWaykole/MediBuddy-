// routes/payment.js — Payment Recording & Management
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const auth = require('../middleware/auth');

// ── RECORD PAYMENT ──
router.post('/', auth, async (req, res) => {
  try {
    const { appointment_id, amount, method, transaction_ref, status } = req.body;
    if (!appointment_id || !amount || !method) {
      return res.status(400).json({ message: 'appointment_id, amount, and method are required' });
    }
    const result = await db.run(
      `INSERT INTO payments (appointment_id, user_id, amount, method, transaction_ref, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime("now"))`,
      [appointment_id, req.user.id, amount, method, transaction_ref||null, status||'success']
    );
    res.status(201).json({ message: 'Payment recorded', payment_id: result.lastID });
  } catch(e) {
    console.error('Payment error:', e);
    res.status(500).json({ message: 'Payment recording failed', error: e.message });
  }
});

// ── GET PAYMENT HISTORY (patient) ──
router.get('/history', auth, async (req, res) => {
  try {
    const payments = await db.all(
      `SELECT p.*, a.appointment_date, a.appointment_time, a.reason,
              u.name as doctor_name, doc.specialization
       FROM payments p
       LEFT JOIN appointments a ON p.appointment_id = a.id
       LEFT JOIN users u ON a.doctor_id = u.id
       LEFT JOIN doctors doc ON u.id = doc.user_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ payments });
  } catch(e) { res.json({ payments: [] }); }
});

// ── GET PAYMENT DETAILS ──
router.get('/:id', auth, async (req, res) => {
  try {
    const payment = await db.get('SELECT * FROM payments WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ payment });
  } catch(e) { res.status(500).json({ message: 'Error fetching payment' }); }
});

module.exports = router;
