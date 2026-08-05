require('dotenv').config();
const mysql = require('mysql2/promise');

// Node 18 kadang resolve "localhost" ke ::1 (IPv6) duluan, padahal MariaDB
// cuma listen di 127.0.0.1 (IPv4) → ECONNREFUSED. Paksa IPv4 di sini.
const rawHost = process.env.DB_HOST || 'localhost';
const dbHost = rawHost === 'localhost' ? '127.0.0.1' : rawHost;

const pool = mysql.createPool({
  host: dbHost,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
