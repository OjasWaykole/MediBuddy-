const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/patient/profile - get patient's own profile
router.get('/profile', requireRole('patient'), async (req, res) => {
  try {
    const profile = await dbGet(
      `SELECT u.id, u.name, u.email, u.created_at,
              p.age, p.gender, p.blood_group, p.phone, p.address,
              p.emergency_contact, p.allergies, p.chronic_conditions, p.id as patient_id
       FROM users u JOIN patients p ON u.id = p.user_id
       WHERE u.id = ?`, [req.user.id]
    );
    if (!profile) return res.status(404).json({ error: 'Patient profile not found.' });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/patient/profile - update patient profile
router.put('/profile', requireRole('patient'), async (req, res) => {
  try {
    const { age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions } = req.body;
    await dbRun(
      `UPDATE patients SET age=?, gender=?, blood_group=?, phone=?, address=?, emergency_contact=?, allergies=?, chronic_conditions=?
       WHERE user_id=?`,
      [age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions, req.user.id]
    );
    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patient/appointments - all appointments for patient
router.get('/appointments', requireRole('patient'), async (req, res) => {
  try {
    const patient = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const appointments = await dbAll(
      `SELECT a.*, u.name as doctor_name, d.specialization, d.hospital
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patient.id]
    );
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patient/appointments - book an appointment
router.post('/appointments', requireRole('patient'), async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, reason } = req.body;
    if (!doctor_id || !appointment_date || !appointment_time)
      return res.status(400).json({ error: 'doctor_id, appointment_date and appointment_time are required.' });

    const patient = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    if (!patient) return res.status(404).json({ error: 'Patient profile not found.' });

    const result = await dbRun(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason) VALUES (?,?,?,?,?)`,
      [patient.id, doctor_id, appointment_date, appointment_time, reason || '']
    );
    res.status(201).json({ message: 'Appointment booked successfully.', appointment_id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patient/medical-records - all medical records for patient
router.get('/medical-records', requireRole('patient'), async (req, res) => {
  try {
    const patient = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const records = await dbAll(
      `SELECT mr.*, u.name as doctor_name, d.specialization
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE mr.patient_id = ?
       ORDER BY mr.created_at DESC`,
      [patient.id]
    );

    // Attach medications to each record
    for (const record of records) {
      record.medications = await dbAll('SELECT * FROM medications WHERE record_id = ?', [record.id]);
    }

    res.json({ medical_records: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patient/vitals - patient's vital history
router.get('/vitals', requireRole('patient'), async (req, res) => {
  try {
    const patient = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
    const vitals = await dbAll(
      `SELECT v.*, u.name as recorded_by
       FROM vitals v JOIN doctors d ON v.doctor_id = d.id JOIN users u ON d.user_id = u.id
       WHERE v.patient_id = ?
       ORDER BY v.recorded_at DESC`,
      [patient.id]
    );
    res.json({ vitals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patient/dashboard - patient dashboard summary
router.get('/dashboard', requireRole('patient'), async (req, res) => {
  try {
    const patient = await dbGet(
      `SELECT p.*, u.name, u.email FROM patients p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?`,
      [req.user.id]
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const [totalAppointments, upcomingAppointments, totalRecords, latestVitals] = await Promise.all([
      dbGet('SELECT COUNT(*) as count FROM appointments WHERE patient_id = ?', [patient.id]),
      dbAll(`SELECT a.*, u.name as doctor_name, d.specialization FROM appointments a
             JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
             WHERE a.patient_id = ? AND a.status IN ('pending','confirmed') AND a.appointment_date >= date('now')
             ORDER BY a.appointment_date ASC LIMIT 3`, [patient.id]),
      dbGet('SELECT COUNT(*) as count FROM medical_records WHERE patient_id = ?', [patient.id]),
      dbGet('SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1', [patient.id]),
    ]);

    res.json({
      patient,
      summary: {
        total_appointments: totalAppointments.count,
        total_records: totalRecords.count,
      },
      upcoming_appointments: upcomingAppointments,
      latest_vitals: latestVitals,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
