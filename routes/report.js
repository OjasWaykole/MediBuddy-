const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { dbGet, dbAll } = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const REPORTS_DIR = path.join(__dirname, '..', 'generated_reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// GET /api/report/patient/:patient_id - generate full patient PDF report
// Doctors can generate for any patient; patients can only generate their own
router.get('/patient/:patient_id', async (req, res) => {
  try {
    const requestedPatientId = parseInt(req.params.patient_id);

    // Authorization check
    if (req.user.role === 'patient') {
      const myProfile = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
      if (!myProfile || myProfile.id !== requestedPatientId) {
        return res.status(403).json({ error: 'You can only download your own report.' });
      }
    }

    // Fetch all data
    const patient = await dbGet(
      `SELECT u.name, u.email, u.created_at, p.*
       FROM patients p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [requestedPatientId]
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const records = await dbAll(
      `SELECT mr.*, u.name as doctor_name, d.specialization
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE mr.patient_id = ?
       ORDER BY mr.created_at DESC`,
      [requestedPatientId]
    );

    for (const record of records) {
      record.medications = await dbAll('SELECT * FROM medications WHERE record_id = ?', [record.id]);
    }

    const vitals = await dbAll(
      `SELECT v.*, u.name as recorded_by
       FROM vitals v JOIN doctors d ON v.doctor_id = d.id JOIN users u ON d.user_id = u.id
       WHERE v.patient_id = ?
       ORDER BY v.recorded_at DESC LIMIT 5`,
      [requestedPatientId]
    );

    const appointments = await dbAll(
      `SELECT a.*, u.name as doctor_name, d.specialization
       FROM appointments a JOIN doctors d ON a.doctor_id = d.id JOIN users u ON d.user_id = u.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC LIMIT 10`,
      [requestedPatientId]
    );

    // Generate PDF
    const filename = `patient_report_${requestedPatientId}_${Date.now()}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    await generatePatientPDF({ patient, records, vitals, appointments, filepath });

    res.download(filepath, `MediBuddy_Report_${patient.name.replace(/\s/g, '_')}.pdf`, (err) => {
      if (err) console.error('Download error:', err);
      // Clean up file after download
      setTimeout(() => fs.unlink(filepath, () => {}), 30000);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report.', details: err.message });
  }
});

// GET /api/report/record/:record_id - generate single prescription PDF
router.get('/record/:record_id', async (req, res) => {
  try {
    const record = await dbGet(
      `SELECT mr.*, u.name as doctor_name, d.specialization, d.hospital, d.qualification, d.phone as doctor_phone,
              pu.name as patient_name, p.age, p.gender, p.blood_group, p.phone as patient_phone
       FROM medical_records mr
       JOIN doctors d ON mr.doctor_id = d.id JOIN users u ON d.user_id = u.id
       JOIN patients p ON mr.patient_id = p.id JOIN users pu ON p.user_id = pu.id
       WHERE mr.id = ?`,
      [req.params.record_id]
    );
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    // Auth check
    if (req.user.role === 'patient') {
      const myPatient = await dbGet('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
      if (!myPatient || myPatient.id !== record.patient_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    record.medications = await dbAll('SELECT * FROM medications WHERE record_id = ?', [record.id]);

    const filename = `prescription_${record.id}_${Date.now()}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    await generatePrescriptionPDF({ record, filepath });

    res.download(filepath, `Prescription_${record.patient_name.replace(/\s/g, '_')}.pdf`, (err) => {
      if (err) console.error('Download error:', err);
      setTimeout(() => fs.unlink(filepath, () => {}), 30000);
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to generate prescription.', details: err.message });
  }
});

// ─── PDF Generators ──────────────────────────────────────────────────────────

function generatePatientPDF({ patient, records, vitals, appointments, filepath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, 595, 80).fill('#1a73e8');
    doc.fill('white').fontSize(24).font('Helvetica-Bold').text('MediBuddy', 50, 20);
    doc.fontSize(10).font('Helvetica').text('Your Health Companion', 50, 50);
    doc.text(`Report Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 350, 35, { align: 'right' });

    doc.moveDown(3);
    doc.fill('#1a73e8').fontSize(16).font('Helvetica-Bold').text('PATIENT HEALTH REPORT', 50, 100);
    doc.moveTo(50, 120).lineTo(545, 120).stroke('#1a73e8');

    // Patient Info Box
    doc.rect(50, 130, 495, 130).fill('#f0f7ff').stroke('#1a73e8');
    doc.fill('#1a73e8').fontSize(13).font('Helvetica-Bold').text('Patient Information', 65, 145);

    const pi = [
      ['Full Name', patient.name],
      ['Email', patient.email],
      ['Age / Gender', `${patient.age || 'N/A'} yrs / ${patient.gender || 'N/A'}`],
      ['Blood Group', patient.blood_group || 'N/A'],
      ['Phone', patient.phone || 'N/A'],
      ['Address', patient.address || 'N/A'],
      ['Allergies', patient.allergies || 'None'],
      ['Chronic Conditions', patient.chronic_conditions || 'None'],
    ];

    let y = 165;
    pi.forEach(([label, value]) => {
      doc.fill('#555').fontSize(9).font('Helvetica-Bold').text(label + ':', 65, y);
      doc.fill('#222').font('Helvetica').text(value, 200, y, { width: 330 });
      y += 14;
    });

    // Vitals
    if (vitals.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'LATEST VITALS', 50);
      let vy = 100;
      const latest = vitals[0];

      const vitalData = [
        ['Blood Pressure', latest.blood_pressure || 'N/A'],
        ['Heart Rate', latest.heart_rate ? `${latest.heart_rate} bpm` : 'N/A'],
        ['Temperature', latest.temperature ? `${latest.temperature} °F` : 'N/A'],
        ['Weight', latest.weight ? `${latest.weight} kg` : 'N/A'],
        ['Height', latest.height ? `${latest.height} cm` : 'N/A'],
        ['Oxygen Saturation', latest.oxygen_saturation ? `${latest.oxygen_saturation}%` : 'N/A'],
        ['Blood Sugar', latest.blood_sugar ? `${latest.blood_sugar} mg/dL` : 'N/A'],
        ['Recorded By', latest.recorded_by || 'N/A'],
        ['Recorded At', new Date(latest.recorded_at).toLocaleString('en-IN')],
      ];

      vitalData.forEach(([label, val]) => {
        doc.fill('#555').fontSize(10).font('Helvetica-Bold').text(label + ':', 60, vy);
        doc.fill('#222').font('Helvetica').text(val, 230, vy);
        vy += 18;
      });
    }

    // Medical Records & Prescriptions
    if (records.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'MEDICAL RECORDS & PRESCRIPTIONS', 50);
      let ry = 100;

      records.forEach((record, idx) => {
        if (ry > 700) { doc.addPage(); ry = 50; }

        doc.rect(50, ry, 495, 16).fill('#1a73e8');
        doc.fill('white').fontSize(11).font('Helvetica-Bold')
          .text(`Record #${idx + 1} — ${new Date(record.created_at).toLocaleDateString('en-IN')} | Dr. ${record.doctor_name} (${record.specialization})`, 55, ry + 3);
        ry += 22;

        const rfields = [
          ['Diagnosis', record.diagnosis],
          ['Symptoms', record.symptoms],
          ['Lab Tests', record.lab_tests],
          ['Diet Advice', record.diet_recommendations],
          ['Exercise', record.exercise_recommendations],
          ['Follow-up', record.follow_up_date],
          ['Notes', record.notes],
        ];

        rfields.forEach(([label, val]) => {
          if (!val) return;
          if (ry > 720) { doc.addPage(); ry = 50; }
          doc.fill('#444').fontSize(9).font('Helvetica-Bold').text(label + ':', 60, ry);
          doc.fill('#222').font('Helvetica').text(val, 200, ry, { width: 340 });
          ry += 15;
        });

        if (record.medications.length > 0) {
          if (ry > 700) { doc.addPage(); ry = 50; }
          doc.fill('#1a73e8').fontSize(10).font('Helvetica-Bold').text('Medications:', 60, ry);
          ry += 15;

          record.medications.forEach((med, mi) => {
            if (ry > 720) { doc.addPage(); ry = 50; }
            doc.rect(70, ry, 460, 14).fill('#e8f4fd');
            doc.fill('#333').fontSize(9).font('Helvetica')
              .text(`${mi + 1}. ${med.medicine_name} — ${med.dosage} | ${med.frequency} | ${med.duration}${med.instructions ? ' | ' + med.instructions : ''}`, 75, ry + 2, { width: 450 });
            ry += 17;
          });
        }
        ry += 10;
        doc.moveTo(50, ry).lineTo(545, ry).stroke('#ccc');
        ry += 12;
      });
    }

    // Appointments History
    if (appointments.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'APPOINTMENT HISTORY', 50);
      let ay = 100;

      appointments.forEach((appt, i) => {
        if (ay > 720) { doc.addPage(); ay = 50; }
        const status_color = appt.status === 'completed' ? '#2e7d32' : appt.status === 'cancelled' ? '#c62828' : '#1565c0';
        doc.fill(status_color).fontSize(9).font('Helvetica-Bold')
          .text(`${i + 1}. ${appt.appointment_date} ${appt.appointment_time} — Dr. ${appt.doctor_name} (${appt.specialization}) — ${appt.status.toUpperCase()}`, 60, ay, { width: 470 });
        if (appt.reason) {
          doc.fill('#555').font('Helvetica').text(`   Reason: ${appt.reason}`, 60, ay + 12, { width: 470 });
          ay += 12;
        }
        ay += 18;
      });
    }

    // Footer on each page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fill('#888').fontSize(8).text(
        `MediBuddy Confidential Medical Report | Page ${i + 1} of ${pages.count} | Generated on ${new Date().toLocaleDateString('en-IN')}`,
        50, 810, { align: 'center', width: 495 }
      );
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function generatePrescriptionPDF({ record, filepath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, 595, 85).fill('#1a73e8');
    doc.fill('white').fontSize(22).font('Helvetica-Bold').text('MediBuddy', 50, 18);
    doc.fontSize(9).font('Helvetica').text('Digital Prescription', 50, 45);
    doc.fontSize(9).text(`Date: ${new Date(record.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 400, 30);
    doc.text(`Rx #${record.id}`, 400, 45);

    // Doctor info
    doc.rect(50, 100, 495, 70).fill('#f0f7ff').stroke('#1a73e8');
    doc.fill('#1a73e8').fontSize(12).font('Helvetica-Bold').text('Prescribing Doctor', 65, 110);
    doc.fill('#333').fontSize(10).font('Helvetica-Bold').text(record.doctor_name, 65, 128);
    doc.fill('#555').fontSize(9).font('Helvetica').text(`${record.specialization} | ${record.hospital || ''}`, 65, 143);
    if (record.doctor_phone) doc.text(`Ph: ${record.doctor_phone}`, 65, 157);

    // Patient info
    doc.rect(50, 180, 495, 60).fill('#fff9f0').stroke('#ff9800');
    doc.fill('#e65100').fontSize(12).font('Helvetica-Bold').text('Patient', 65, 190);
    doc.fill('#333').fontSize(10).font('Helvetica-Bold').text(record.patient_name, 65, 207);
    doc.fill('#555').fontSize(9).font('Helvetica').text(`Age: ${record.age || 'N/A'} | Gender: ${record.gender || 'N/A'} | Blood Group: ${record.blood_group || 'N/A'}`, 65, 222);

    let y = 260;

    // Diagnosis
    doc.fill('#1a73e8').fontSize(13).font('Helvetica-Bold').text('Diagnosis', 50, y);
    y += 18;
    doc.rect(50, y, 495, 30).fill('#e8f4fd');
    doc.fill('#222').fontSize(11).font('Helvetica').text(record.diagnosis, 60, y + 9, { width: 475 });
    y += 40;

    if (record.symptoms) {
      doc.fill('#555').fontSize(10).font('Helvetica-Bold').text('Symptoms:', 50, y);
      doc.font('Helvetica').fill('#333').text(record.symptoms, 160, y, { width: 385 });
      y += 20;
    }

    // Medications
    if (record.medications.length > 0) {
      y += 10;
      doc.fill('#1a73e8').fontSize(13).font('Helvetica-Bold').text('Medications', 50, y);
      y += 20;

      record.medications.forEach((med, i) => {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.rect(50, y, 495, 50).stroke('#1a73e8');
        doc.fill('#1a73e8').fontSize(11).font('Helvetica-Bold').text(`${i + 1}. ${med.medicine_name}`, 65, y + 8);
        doc.fill('#333').fontSize(9).font('Helvetica').text(`Dosage: ${med.dosage}`, 65, y + 24);
        doc.text(`Frequency: ${med.frequency}`, 200, y + 24);
        doc.text(`Duration: ${med.duration}`, 360, y + 24);
        if (med.instructions) doc.fill('#666').text(`Instructions: ${med.instructions}`, 65, y + 36, { width: 470 });
        y += 58;
      });
    }

    y += 10;

    // Recommendations
    if (record.diet_recommendations) {
      if (y > 680) { doc.addPage(); y = 50; }
      doc.fill('#2e7d32').fontSize(11).font('Helvetica-Bold').text('🥗 Diet Recommendations', 50, y);
      y += 15;
      doc.fill('#333').fontSize(9).font('Helvetica').text(record.diet_recommendations, 65, y, { width: 470 });
      y += 30;
    }

    if (record.exercise_recommendations) {
      if (y > 680) { doc.addPage(); y = 50; }
      doc.fill('#1565c0').fontSize(11).font('Helvetica-Bold').text('🏃 Exercise Recommendations', 50, y);
      y += 15;
      doc.fill('#333').fontSize(9).font('Helvetica').text(record.exercise_recommendations, 65, y, { width: 470 });
      y += 30;
    }

    if (record.lab_tests) {
      if (y > 680) { doc.addPage(); y = 50; }
      doc.fill('#6a1b9a').fontSize(11).font('Helvetica-Bold').text('🔬 Lab Tests Advised', 50, y);
      y += 15;
      doc.fill('#333').fontSize(9).font('Helvetica').text(record.lab_tests, 65, y, { width: 470 });
      y += 30;
    }

    if (record.follow_up_date) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.rect(50, y, 495, 28).fill('#fff3e0').stroke('#ff9800');
      doc.fill('#e65100').fontSize(10).font('Helvetica-Bold')
        .text(`📅 Follow-up Date: ${record.follow_up_date}`, 65, y + 8);
      y += 40;
    }

    // Footer
    doc.fill('#888').fontSize(8).text(
      'This prescription is generated by MediBuddy. Please consult your doctor before making any changes to medication.',
      50, 810, { align: 'center', width: 495 }
    );

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function sectionHeader(doc, title, x) {
  doc.rect(x, 50, 495, 30).fill('#1a73e8');
  doc.fill('white').fontSize(13).font('Helvetica-Bold').text(title, x + 10, 59);
}

module.exports = router;
