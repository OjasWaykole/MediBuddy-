const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'medibuddy.db');
let db;

function getDB() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('DB connection error:', err);
      else console.log('✅ Connected to SQLite database');
    });
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

async function initDB() {
  const database = getDB();

  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // Users table (shared for auth)
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT CHECK(role IN ('patient','doctor','admin')) NOT NULL DEFAULT 'patient',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Doctors table
      database.run(`
        CREATE TABLE IF NOT EXISTS doctors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          specialization TEXT NOT NULL,
          qualification TEXT NOT NULL,
          experience_years INTEGER DEFAULT 0,
          hospital TEXT,
          consultation_fee REAL DEFAULT 0,
          available_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri',
          available_time TEXT DEFAULT '09:00-17:00',
          diseases_treated TEXT,
          rating REAL DEFAULT 4.0,
          bio TEXT,
          phone TEXT,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Patients table
      database.run(`
        CREATE TABLE IF NOT EXISTS patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          age INTEGER,
          gender TEXT,
          blood_group TEXT,
          phone TEXT,
          address TEXT,
          emergency_contact TEXT,
          allergies TEXT,
          chronic_conditions TEXT,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Appointments table
      database.run(`
        CREATE TABLE IF NOT EXISTS appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id INTEGER NOT NULL,
          doctor_id INTEGER NOT NULL,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          status TEXT CHECK(status IN ('pending','confirmed','completed','cancelled')) DEFAULT 'pending',
          reason TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(patient_id) REFERENCES patients(id),
          FOREIGN KEY(doctor_id) REFERENCES doctors(id)
        )
      `);

      // Medical records / prescriptions
      database.run(`
        CREATE TABLE IF NOT EXISTS medical_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appointment_id INTEGER,
          patient_id INTEGER NOT NULL,
          doctor_id INTEGER NOT NULL,
          diagnosis TEXT NOT NULL,
          symptoms TEXT,
          prescriptions TEXT,
          lab_tests TEXT,
          diet_recommendations TEXT,
          exercise_recommendations TEXT,
          follow_up_date TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(patient_id) REFERENCES patients(id),
          FOREIGN KEY(doctor_id) REFERENCES doctors(id),
          FOREIGN KEY(appointment_id) REFERENCES appointments(id)
        )
      `);

      // Medications table (part of prescription detail)
      database.run(`
        CREATE TABLE IF NOT EXISTS medications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id INTEGER NOT NULL,
          medicine_name TEXT NOT NULL,
          dosage TEXT NOT NULL,
          frequency TEXT NOT NULL,
          duration TEXT NOT NULL,
          instructions TEXT,
          FOREIGN KEY(record_id) REFERENCES medical_records(id) ON DELETE CASCADE
        )
      `);

      // Vital signs
      database.run(`
        CREATE TABLE IF NOT EXISTS vitals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id INTEGER NOT NULL,
          doctor_id INTEGER NOT NULL,
          blood_pressure TEXT,
          heart_rate INTEGER,
          temperature REAL,
          weight REAL,
          height REAL,
          oxygen_saturation REAL,
          blood_sugar REAL,
          recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(patient_id) REFERENCES patients(id),
          FOREIGN KEY(doctor_id) REFERENCES doctors(id)
        )
      `);

      // Seed demo data
      database.get("SELECT COUNT(*) as cnt FROM users", async (err, row) => {
        if (!err && row.cnt === 0) {
          await seedDemoData(database);
        }
        resolve();
      });
    });
  });
}

async function seedDemoData(database) {
  const hash = async (pw) => bcrypt.hash(pw, 10);

  const doctorPw = await hash('doctor123');
  const patientPw = await hash('patient123');

  const doctors = [
    { name: 'Dr. Arjun Mehta', email: 'arjun@medibuddy.com', spec: 'Cardiologist', qual: 'MBBS, MD Cardiology', exp: 15, hospital: 'City Heart Hospital', fee: 800, diseases: 'heart disease,hypertension,chest pain,arrhythmia', bio: 'Senior cardiologist with 15 years of experience.' },
    { name: 'Dr. Priya Sharma', email: 'priya@medibuddy.com', spec: 'Dermatologist', qual: 'MBBS, MD Dermatology', exp: 8, hospital: 'Skin Care Clinic', fee: 600, diseases: 'acne,eczema,psoriasis,skin rash,hair loss', bio: 'Expert in skin conditions and cosmetic dermatology.' },
    { name: 'Dr. Rajesh Kumar', email: 'rajesh@medibuddy.com', spec: 'General Physician', qual: 'MBBS, MD General Medicine', exp: 12, hospital: 'MediBuddy Clinic', fee: 400, diseases: 'fever,cold,flu,diabetes,thyroid,infection', bio: 'General physician treating all common illnesses.' },
    { name: 'Dr. Sneha Patil', email: 'sneha@medibuddy.com', spec: 'Neurologist', qual: 'MBBS, DM Neurology', exp: 10, hospital: 'Brain & Spine Center', fee: 900, diseases: 'migraine,epilepsy,stroke,parkinson,headache', bio: 'Specialist in neurological disorders.' },
    { name: 'Dr. Amit Joshi', email: 'amit@medibuddy.com', spec: 'Orthopedist', qual: 'MBBS, MS Orthopedics', exp: 14, hospital: 'Bone & Joint Hospital', fee: 700, diseases: 'fracture,joint pain,arthritis,back pain,knee pain', bio: 'Expert in bone and joint treatments.' },
  ];

  for (const doc of doctors) {
    await new Promise((res) => {
      database.run(`INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)`,
        [doc.name, doc.email, doctorPw, 'doctor'], function(err) {
          if (err) { res(); return; }
          const userId = this.lastID;
          database.run(`INSERT INTO doctors (user_id, specialization, qualification, experience_years, hospital, consultation_fee, diseases_treated, bio) VALUES (?,?,?,?,?,?,?,?)`,
            [userId, doc.spec, doc.qual, doc.exp, doc.hospital, doc.fee, doc.diseases, doc.bio], res);
        });
    });
  }

  // Demo patient
  await new Promise((res) => {
    database.run(`INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)`,
      ['Rahul Verma', 'rahul@patient.com', patientPw, 'patient'], function(err) {
        if (err) { res(); return; }
        const userId = this.lastID;
        database.run(`INSERT INTO patients (user_id, age, gender, blood_group, phone, address, allergies, chronic_conditions) VALUES (?,?,?,?,?,?,?,?)`,
          [userId, 28, 'Male', 'O+', '9876543210', 'Jalgaon, Maharashtra', 'Penicillin', 'None'], res);
      });
  });

  console.log('✅ Demo data seeded successfully');
  console.log('   Doctor login: arjun@medibuddy.com / doctor123');
  console.log('   Patient login: rahul@patient.com / patient123');
}

// Helper to run queries as promises
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { initDB, getDB, dbRun, dbGet, dbAll };
