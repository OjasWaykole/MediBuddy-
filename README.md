# 🏥 MediBuddy Backend API

Complete backend for the MediBuddy healthcare app built with **Node.js + Express + SQLite**.

---

## 🚀 Setup & Run

```bash
# 1. Go into the backend folder
cd medibuddy-backend

# 2. Install dependencies
npm install

# 3. Start the server
npm start         # production
npm run dev       # development with auto-reload (nodemon)

# Server runs at: http://localhost:5000
```

---

## 🔑 Demo Credentials (auto-seeded on first run)

| Role    | Email                   | Password    |
|---------|-------------------------|-------------|
| Doctor  | arjun@medibuddy.com     | doctor123   |
| Doctor  | priya@medibuddy.com     | doctor123   |
| Doctor  | rajesh@medibuddy.com    | doctor123   |
| Patient | rahul@patient.com       | patient123  |

---

## 📁 Folder Structure

```
medibuddy-backend/
├── server.js               # Entry point
├── package.json
├── medibuddy.db            # SQLite database (auto-created)
├── generated_reports/      # Temp PDF storage
├── db/
│   └── database.js         # DB init + helpers
├── middleware/
│   └── auth.js             # JWT middleware
└── routes/
    ├── auth.js             # Login / Register
    ├── patient.js          # Patient Console
    ├── doctor.js           # Doctor Console
    ├── search.js           # Search doctors/diseases
    └── report.js           # PDF Report generation
```

---

## 📡 API Reference

### 🔐 AUTH  (`/api/auth`)

| Method | Endpoint        | Body / Params | Description |
|--------|-----------------|---------------|-------------|
| POST   | `/register`     | `name, email, password, role` + role-specific fields | Register patient or doctor |
| POST   | `/login`        | `email, password` | Login and get JWT token |
| GET    | `/me`           | —             | Get current user info |

**Patient register extra fields:** `age, gender, blood_group, phone, address, emergency_contact, allergies, chronic_conditions`

**Doctor register extra fields:** `specialization, qualification, experience_years, hospital, consultation_fee, available_days, available_time, diseases_treated, bio, phone`

---

### 🧑‍⚕️ PATIENT CONSOLE  (`/api/patient`) — requires `role: patient`

| Method | Endpoint             | Description |
|--------|----------------------|-------------|
| GET    | `/dashboard`         | Summary: upcoming appointments, total records, latest vitals |
| GET    | `/profile`           | View own profile |
| PUT    | `/profile`           | Update profile |
| GET    | `/appointments`      | All appointments |
| POST   | `/appointments`      | Book appointment `{doctor_id, appointment_date, appointment_time, reason}` |
| GET    | `/medical-records`   | All prescriptions + medical records |
| GET    | `/vitals`            | Vital signs history |

---

### 👨‍⚕️ DOCTOR CONSOLE  (`/api/doctor`) — requires `role: doctor`

| Method | Endpoint                        | Description |
|--------|---------------------------------|-------------|
| GET    | `/dashboard`                    | Today's appointments, patient count, pending |
| GET    | `/profile`                      | View own profile |
| PUT    | `/profile`                      | Update profile |
| GET    | `/appointments`                 | All appointments |
| PUT    | `/appointments/:id/status`      | Update status `{status: confirmed/completed/cancelled, notes}` |
| GET    | `/patients`                     | All patients treated |
| GET    | `/patients/:patient_id`         | Full patient info + records + vitals |
| POST   | `/medical-record`               | Create prescription/record (see body below) |
| POST   | `/vitals`                       | Record patient vitals |

**Medical record body:**
```json
{
  "patient_id": 1,
  "appointment_id": 2,
  "diagnosis": "Type 2 Diabetes",
  "symptoms": "Excessive thirst, frequent urination",
  "lab_tests": "HbA1c, Fasting Blood Sugar",
  "diet_recommendations": "Low sugar diet, avoid processed foods",
  "exercise_recommendations": "30 min walk daily",
  "follow_up_date": "2024-03-01",
  "notes": "Monitor blood sugar daily",
  "medications": [
    {
      "medicine_name": "Metformin",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "3 months",
      "instructions": "Take after meals"
    }
  ]
}
```

---

### 🔍 SEARCH  (`/api/search`)

| Method | Endpoint                  | Query Params | Description |
|--------|---------------------------|--------------|-------------|
| GET    | `/doctors`                | `query, specialization, min_fee, max_fee, available_day` | Search all doctors |
| GET    | `/doctors/:doctor_id`     | —            | Single doctor details |
| GET    | `/disease?name=fever`     | `name`       | Disease info + matching doctors |
| GET    | `/specializations`        | —            | List all specializations |

---

### 📄 REPORTS  (`/api/report`)

| Method | Endpoint                  | Description |
|--------|---------------------------|-------------|
| GET    | `/patient/:patient_id`    | Download full patient health PDF report |
| GET    | `/record/:record_id`      | Download single prescription PDF |

> 📌 Patients can only download **their own** reports. Doctors can download **any** patient's report.

---

## 🔗 Connecting to React Frontend (MediBuddy)

In your React app, set the base URL:

```js
// src/api/config.js
export const BASE_URL = 'http://localhost:5000/api';
```

Include the JWT token in all requests:
```js
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json'
};
```

---

## 🗄️ Database Tables

- **users** — all users (shared auth)
- **doctors** — doctor profiles
- **patients** — patient profiles
- **appointments** — bookings between patients and doctors
- **medical_records** — diagnoses, prescriptions, recommendations
- **medications** — medications within a record
- **vitals** — blood pressure, heart rate, temperature, etc.
