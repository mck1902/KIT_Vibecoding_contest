require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const sessionRoutes = require('./routes/sessions');
const lectureRoutes = require('./routes/lectures');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

connectDB();

app.get('/', (req, res) => res.send('EduWatch Backend is running'));
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', message: 'EduWatch Backend is running perfectly!' })
);

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/lectures', lectureRoutes);

app.listen(PORT, () => {
  console.log(`[Backend] Server listening on port ${PORT}`);
});
