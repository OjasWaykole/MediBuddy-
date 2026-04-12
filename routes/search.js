const express = require('express');
const { dbAll, dbGet } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/search/doctors?query=fever&specialization=General&min_fee=0&max_fee=1000
router.get('/doctors', async (req, res) => {
  try {
    const { query = '', specialization, min_fee = 0, max_fee = 99999, available_day } = req.query;

    let sql = `
      SELECT u.name, u.email,
             d.id as doctor_id, d.specialization, d.qualification, d.experience_years,
             d.hospital, d.consultation_fee, d.available_days, d.available_time,
             d.diseases_treated, d.rating, d.bio, d.phone
      FROM doctors d JOIN users u ON d.user_id = u.id
      WHERE (
        LOWER(u.name) LIKE ? OR
        LOWER(d.specialization) LIKE ? OR
        LOWER(d.diseases_treated) LIKE ? OR
        LOWER(d.hospital) LIKE ?
      )
      AND d.consultation_fee BETWEEN ? AND ?
    `;
    const q = `%${query.toLowerCase()}%`;
    const params = [q, q, q, q, min_fee, max_fee];

    if (specialization) {
      sql += ` AND LOWER(d.specialization) LIKE ?`;
      params.push(`%${specialization.toLowerCase()}%`);
    }

    if (available_day) {
      sql += ` AND LOWER(d.available_days) LIKE ?`;
      params.push(`%${available_day.toLowerCase()}%`);
    }

    sql += ` ORDER BY d.rating DESC`;

    const doctors = await dbAll(sql, params);
    res.json({ doctors, count: doctors.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search/doctors/:doctor_id - get single doctor details
router.get('/doctors/:doctor_id', async (req, res) => {
  try {
    const doctor = await dbGet(
      `SELECT u.name, u.email, d.*
       FROM doctors d JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [req.params.doctor_id]
    );
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
    res.json({ doctor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search/disease?name=fever - get doctors who treat a disease
router.get('/disease', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'disease name query param required.' });

    const doctors = await dbAll(
      `SELECT u.name, u.email,
              d.id as doctor_id, d.specialization, d.qualification, d.experience_years,
              d.hospital, d.consultation_fee, d.available_days, d.available_time,
              d.diseases_treated, d.rating, d.bio
       FROM doctors d JOIN users u ON d.user_id = u.id
       WHERE LOWER(d.diseases_treated) LIKE ?
       ORDER BY d.experience_years DESC`,
      [`%${name.toLowerCase()}%`]
    );

    const disease_info = getDiseaseInfo(name);
    res.json({ disease_name: name, disease_info, available_doctors: doctors, count: doctors.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search/specializations - list all specializations
router.get('/specializations', async (req, res) => {
  try {
    const rows = await dbAll('SELECT DISTINCT specialization FROM doctors ORDER BY specialization ASC', []);
    res.json({ specializations: rows.map(r => r.specialization) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Utility: provide basic disease info (can be expanded with real medical data)
function getDiseaseInfo(disease) {
  const info = {
    fever: { description: 'An elevated body temperature, usually above 38°C (100.4°F).', common_causes: ['Infection', 'Inflammation', 'Heat exhaustion'], when_to_see_doctor: 'If fever exceeds 39.5°C or lasts more than 3 days.' },
    diabetes: { description: 'A chronic condition affecting how your body processes blood sugar.', common_causes: ['Type 1 (autoimmune)', 'Type 2 (lifestyle/genetic)', 'Gestational'], when_to_see_doctor: 'Immediately if experiencing excessive thirst, frequent urination, or blurred vision.' },
    hypertension: { description: 'High blood pressure — a reading consistently above 130/80 mmHg.', common_causes: ['Unhealthy diet', 'Stress', 'Genetics', 'Obesity'], when_to_see_doctor: 'Regularly if on medication; urgently if BP > 180/120 mmHg.' },
    migraine: { description: 'Recurrent, severe headaches often with nausea and light sensitivity.', common_causes: ['Stress', 'Hormonal changes', 'Sleep disruption', 'Certain foods'], when_to_see_doctor: 'If headaches are severe, frequent, or accompanied by neurological symptoms.' },
    acne: { description: 'A skin condition causing pimples, blackheads, and inflammation.', common_causes: ['Excess oil production', 'Clogged pores', 'Bacteria', 'Hormones'], when_to_see_doctor: 'If acne is severe, causing scarring, or not responding to OTC treatments.' },
    arthritis: { description: 'Inflammation of one or more joints causing pain and stiffness.', common_causes: ['Osteoarthritis (wear and tear)', 'Rheumatoid (autoimmune)', 'Gout'], when_to_see_doctor: 'When joint pain is persistent, severe, or limiting daily activities.' },
  };

  const key = Object.keys(info).find(k => disease.toLowerCase().includes(k));
  return key ? info[key] : { description: 'Consult a qualified doctor for accurate information about this condition.', common_causes: [], when_to_see_doctor: 'When symptoms are persistent or worsening.' };
}

module.exports = router;
