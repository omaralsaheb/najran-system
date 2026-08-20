// تطبيق Express لحاله (بدون listen) — منشان يشتغل بطريقتين:
//  1. سيرفر عادي (backend/server.js) على Railway/Render أو محلياً
//  2. Netlify Function (netlify/functions/api.js) بدون سيرفر دائم
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const clientRoutes = require('./routes/clients');
const taskRoutes = require('./routes/tasks');
const contentRoutes = require('./routes/content');
const financeRoutes = require('./routes/finance');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/finance', financeRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

module.exports = app;
