require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const sessionRoutes = require('./routes/sessions');
const lectureRoutes = require('./routes/lectures');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // origin이 없으면 서버 간 요청(curl 등) — 허용
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS 차단: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
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
