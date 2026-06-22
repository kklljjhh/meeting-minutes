const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const meetingRoutes = require('./routes/meeting');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/meeting', meetingRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
});