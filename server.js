// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Short code must be 6–8 alphanumeric characters
const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helpers
function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function generateCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/* ================= HEALTHCHECK ================= */

// GET /healthz
app.get('/healthz', (req, res) => {
  res.status(200).json({
    ok: true,
    version: '1.0',
    uptime: process.uptime(),
  });
});

/* ================= PAGES ================= */

// Dashboard: GET /
app.get('/', async (req, res) => {
  const q = req.query.q || '';
  try {
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await db.query(
        `SELECT code, target_url, total_clicks, last_clicked
         FROM links
         WHERE code ILIKE $1 OR target_url ILIKE $1
         ORDER BY created_at DESC`,
        [like]
      );
    } else {
      result = await db.query(
        `SELECT code, target_url, total_clicks, last_clicked
         FROM links
         ORDER BY created_at DESC`
      );
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    res.render('dashboard', {
      links: result.rows,
      search: q,
      baseUrl,
    });
  } catch (err) {
    console.error('Error loading dashboard', err);
    res.status(500).send('Internal Server Error');
  }
});

// Stats page: GET /code/:code
app.get('/code/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await db.query(
      'SELECT code, target_url, total_clicks, last_clicked, created_at FROM links WHERE code = $1',
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).send('Link not found');
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    res.render('stats', {
      link: result.rows[0],
      baseUrl,
    });
  } catch (err) {
    console.error('Error loading stats', err);
    res.status(500).send('Internal Server Error');
  }
});

/* ================= API ENDPOINTS ================= */

// POST /api/links → create link
app.post('/api/links', async (req, res) => {
  try {
    let { url, code } = req.body;

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid or missing URL' });
    }

    if (code && !CODE_REGEX.test(code)) {
      return res.status(400).json({
        error: 'Custom code must match [A-Za-z0-9]{6,8}',
      });
    }

    // Generate code if not provided
    if (!code) {
      code = generateCode(6);
    }

    const insertQuery = `
      INSERT INTO links (code, target_url)
      VALUES ($1, $2)
      RETURNING code, target_url, total_clicks, last_clicked
    `;

    const result = await db.query(insertQuery, [code, url]);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    // Unique violation → code already exists
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Code already exists' });
    }
    console.error('Error creating link', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/links → list all
app.get('/api/links', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT code, target_url, total_clicks, last_clicked
       FROM links
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing links', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/links/:code → stats for one
app.get('/api/links/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await db.query(
      `SELECT code, target_url, total_clicks, last_clicked, created_at
       FROM links WHERE code = $1`,
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching link', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/links/:code → delete
app.delete('/api/links/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await db.query('DELETE FROM links WHERE code = $1', [code]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // No content
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting link', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/* ================= REDIRECT ROUTE ================= */

// This MUST be after /api and /code so it doesn’t swallow those routes.
// GET /:code → redirect to target URL
app.get('/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await db.query(
      'SELECT target_url FROM links WHERE code = $1',
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).send('Not found');
    }

    const targetUrl = result.rows[0].target_url;

    // Update click stats
    await db.query(
      `UPDATE links
       SET total_clicks = total_clicks + 1,
           last_clicked = NOW()
       WHERE code = $1`,
      [code]
    );

    return res.redirect(302, targetUrl);
  } catch (err) {
    console.error('Error in redirect', err);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`TinyLink listening on port ${PORT}`);
});