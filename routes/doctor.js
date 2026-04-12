const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/doctor/profile
router.get('/profile', requireRole('doctor'), async (req, res) => {
  try {
    const profile = await dbGet(
      `SELECT u.id, u.name, u.email, u.created_at,
              d.id as doctor_id, d.specialization, d.qualification, d.experience_years,
              d.hospital, d.consultation_fee, d.available_days, d.available_time,
              d.diseases_treated, d.rating, d.bio, d.phone
       FROM users u JOIN doctors d ON u.id = d.user_id
       WHERE u.id = ?`, [req.user.id]
    );
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/doctor/profile
router.put('/profile', requireRole('doctor'), async (req, res) => {
  try {
    const { specialization, qualification, experience_years, hospital, consultation_fee, available_days, available_time, diseases_treated, bio, phone } = req.body;
    await dbRun(
      `UPDATE doctors SET specialization=?, qualification=?, experience_years=?, hospital=?, consultation_fee=?, available_days=?, available_time=?, diseases_treated=?, bio=?, phone=?
       WHERE user_id=?`,
      [specialization, qualification, experience_years, hospital, consultation_fee, available_days, available_time, diseases_treated, bio, phone, req.user.id]
    );
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctor/appointments - all appointments for this doctor
router.get('/appointments', requireRole('doctor'), async (req, res) => {
  try {
    const doctor = await dbGet('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
    if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });

    const appointments = await dbAll(
      `SELECT a.*, u.name as patient_name, p.age, p.gender, p.blood_group, p.phone as patient_phone
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
      [doctor.id]
    );
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/doctor/appointments/:id/status - confirm/complete/cancel
router.put('/appointments/:id/status', requireRole('doctor'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['confirmed', 'completed', 'cancelled'].includes(status))
      return res.status(400).json({ error: 'Invalid status.' });

    await dbRun(
      'UPDATE appointments SET status = ?, notes = ? WHERE id = ?',
      [status, notes || '', req.params.id]
    );
    res.json({ message: `Appointment ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctor/patients - list all patients this doctor has treated
router.get('/patients', requireRole('doctor'), async (req, res) => {
  try {
    const doctor = await dbGet('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
    const patients = await dbAll(
      `SELECT DISTINCT u.name, u.email, p.id as patient_id, p.age, p.gender, p.blood_group, p.phone, p.chronic_conditions
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY u.name ASC`,
      [doctor.id]
    );
    res.json({ patients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctor/patients/:patient_id - full patient info for doctor
router.get('/patients/:patient_id', requireRole('doctor'), async (req, res) => {
  try {
    const patient = await dbGet(
      `SELECT u.name, u.email, p.* FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [req.params.patient_id]
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const records = await dbAll(
      `SELECT mr.*, u.name as doctor_name FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id JOIN users u ON d.user_id = u.id
       WHERE mr.patient_id = ? ORDER BY mr.created_at DESC`,
      [req.params.patient_id]
    );
    for (const r of records) {
      r.medications = await dbAll('SELECT * FROM medications WHERE record_id = ?', [r.id]);
    }

    const vitals = await dbAll(
      'SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 10',
      [req.params.patient_id]
    );

    res.json({ patient, medical_records: records, vitals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctor/medical-record - create a medical record / prescription for a patient
router.post('/medical-record', requireRole('doctor'), async (req, res) => {
  try {
    const {
      patient_id, appointment_id,
      diagnosis, symptoms, lab_tests,
      diet_recommendations, exercise_recommendations,
      follow_up_date, notes,
      medications = []   // array of { medicine_name, dosage, frequency, duration, instructions }
    } = req.body;

    if (!patient_id || !diagnosis)
      return res.status(400).json({ error: 'patient_id and diagnosis are required.' });

    const doctor = await dbGet('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);

    const result = await dbRun(
      `INSERT INTO medical_records (appointment_id, patient_id, doctor_id, diagnosis, symptoms, lab_tests, diet_recommendations, exercise_recommendations, follow_up_date, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [appointment_id || null, patient_id, doctor.id, diagnosis, symptoms || '', lab_tests || '', diet_recommendations || '', exercise_recommendations || '', follow_up_date || '', notes || '']
    );
    const recordId = result.lastID;

    // Add medications
    for (const med of medications) {
      await dbRun(
        'INSERT INTO medications (record_id, medicine_name, dosage, frequency, duration, instructions) VALUES (?,?,?,?,?,?)',
        [recordId, med.medicine_name, med.dosage, med.frequency, med.duration, med.instructions || '']
      );
    }

    // Mark appointment completed if appointment_id provided
    if (appointment_id) {
      await dbRun("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointment_id]);
    }

    res.status(201).json({ message: 'Medical record created.', record_id: recordId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctor/vitals - record patient vitals
router.post('/vitals', requireRole('doctor'), async (req, res) => {
  try {
    const { patient_id, blood_pressure, heart_rate, temperature, weight, height, oxygen_saturation, blood_sugar } = req.body;
    if (!patient_id) return res.status(400).json({ error: 'patient_id is required.' });

    const doctor = await dbGet('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
    await dbRun(
      `INSERT INTO vitals (patient_id, doctor_id, blood_pressure, heart_rate, temperature, weight, height, oxygen_saturation, blood_sugar)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [patient_id, doctor.id, blood_pressure, heart_rate, temperature, weight, height, oxygen_saturation, blood_sugar]
    );
    res.status(201).json({ message: 'Vitals recorded.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctor/dashboard
router.get('/dashboard', requireRole('doctor'), async (req, res) => {
  try {
    const doctor = await dbGet(
      `SELECT d.*, u.name, u.email FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.user_id = ?`,
      [req.user.id]
    );

    const [totalPatients, todayAppointments, totalRecords, pendingAppointments] = await Promise.all([
      dbGet(`SELECT COUNT(DISTINCT patient_id) as count FROM appointments WHERE doctor_id = ?`, [doctor.id]),
      dbAll(`SELECT a.*, u.name as patient_name FROM appointments a
             JOIN patients p ON a.patient_id = p.id JOIN users u ON p.user_id = u.id
             WHERE a.doctor_id = ? AND a.appointment_date = date('now')
             ORDER BY a.appointment_time ASC`, [doctor.id]),
      dbGet('SELECT COUNT(*) as count FROM medical_records WHERE doctor_id = ?', [doctor.id]),
      dbGet(`SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND status = 'pending'`, [doctor.id]),
    ]);

    res.json({
      doctor,
      summary: {
        total_patients: totalPatients.count,
        total_records: totalRecords.count,
        pending_appointments: pendingAppointments.count,
      },
      today_appointments: todayAppointments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
