'use strict';

require('./telemetry');

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { recordException, recordHttpRequest, shutdownTelemetry } = require('./telemetry');

const app = express();
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'inventory.sqlite');
const db = new Database(databasePath);

app.use((req, res, next) => {
  const requestStartTime = process.hrtime.bigint();
  res.once('finish', () => {
    const responseTimeMs = Number(process.hrtime.bigint() - requestStartTime) / 1e6;
    const endpoint = req.route
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.path;
    recordHttpRequest({
      endpoint,
      method: req.method,
      statusCode: res.statusCode,
      responseTimeMs,
      timestamp: new Date().toISOString()
    });
  });
  next();
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);

const NAME_ALLOWED_CHARACTERS = /^[\p{L}\p{N}\s.'’\-()_]+$/u;
const DESCRIPTION_ALLOWED_CHARACTERS = /^[\p{L}\p{N}\s.,;:!?'"’“”()\-_/#+&@%]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function validateItem(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'El cuerpo debe ser un objeto JSON con name y description.';
  }

  const { name, description } = body;
  if (typeof name !== 'string' || typeof description !== 'string') {
    return 'Los campos name y description son obligatorios y deben ser texto.';
  }

  const cleanName = name.trim();
  const cleanDescription = description.trim();
  if (CONTROL_CHARACTERS.test(cleanName) || CONTROL_CHARACTERS.test(cleanDescription)) {
    return 'Los campos no pueden contener caracteres de control.';
  }
  if (cleanName.length < 3 || cleanName.length > 100) {
    return 'El nombre debe contener entre 3 y 100 caracteres.';
  }
  if (!NAME_ALLOWED_CHARACTERS.test(cleanName)) {
    return 'El nombre contiene caracteres no permitidos.';
  }
  if (cleanDescription.length < 3 || cleanDescription.length > 100) {
    return 'La descripción debe contener entre 3 y 100 caracteres.';
  }
  if (!DESCRIPTION_ALLOWED_CHARACTERS.test(cleanDescription)) {
    return 'La descripción contiene caracteres no permitidos.';
  }

  return { name: cleanName, description: cleanDescription };
}

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function getItem(id) {
  return db.prepare('SELECT id, name, description, created_at, updated_at FROM items WHERE id = ?').get(id);
}

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', message: 'API disponible' });
  } catch (error) {
    res.status(503).json({ status: 'error', message: 'La base de datos no está disponible.' });
  }
});

app.get('/items', (_req, res) => {
  const items = db.prepare(
    'SELECT id, name, description, created_at, updated_at FROM items ORDER BY id ASC'
  ).all();
  res.json(items);
});

app.get('/items/count', (_req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM items').get();
  res.json({ count });
});

app.get('/items/last', (_req, res) => {
  const item = db.prepare(
    'SELECT id, name, description, created_at, updated_at FROM items ORDER BY id DESC LIMIT 1'
  ).get();
  res.json(item || null);
});

app.get('/items/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  const item = getItem(id);
  if (!item) return res.status(404).json({ error: 'Ítem no encontrado.' });
  return res.json(item);
});

app.post('/items', (req, res) => {
  const item = validateItem(req.body);
  if (typeof item === 'string') return res.status(400).json({ error: item });

  const result = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)').run(item.name, item.description);
  return res.status(201).json(getItem(Number(result.lastInsertRowid)));
});

app.post('/items/bulk', (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'El cuerpo debe ser un arreglo JSON de ítems.' });
  }
  if (req.body.length === 0) {
    return res.status(400).json({ error: 'Debes proporcionar al menos un ítem.' });
  }

  const validatedItems = [];
  for (let index = 0; index < req.body.length; index += 1) {
    const item = validateItem(req.body[index]);
    if (typeof item === 'string') {
      return res.status(400).json({ error: `Ítem ${index + 1}: ${item}` });
    }
    validatedItems.push(item);
  }

  const insertItems = db.transaction((items) => {
    const insert = db.prepare('INSERT INTO items (name, description) VALUES (?, ?)');
    return items.map((item) => {
      const id = Number(insert.run(item.name, item.description).lastInsertRowid);
      return getItem(id);
    });
  });
  const createdItems = insertItems(validatedItems);

  return res.status(201).json({ created: createdItems.length, items: createdItems });
});

app.put('/items/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  const item = validateItem(req.body);
  if (typeof item === 'string') return res.status(400).json({ error: item });
  if (!getItem(id)) return res.status(404).json({ error: 'Ítem no encontrado.' });

  db.prepare(`
    UPDATE items
    SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(item.name, item.description, id);
  return res.json(getItem(id));
});

app.delete('/items/clear', (_req, res) => {
  const result = db.prepare('DELETE FROM items').run();
  return res.json({ deleted: result.changes, message: 'Los registros se limpiaron correctamente.' });
});

app.delete('/items/truncate', (_req, res) => {
  const reset = db.transaction(() => {
    const result = db.prepare('DELETE FROM items').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'items'").run();
    return result.changes;
  });
  return res.json({ deleted: reset(), message: 'El inventario se truncó correctamente.' });
});

app.delete('/items/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El ID debe ser un entero positivo.' });

  const result = db.prepare('DELETE FROM items WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Ítem no encontrado.' });
  return res.json({ deleted: true, id });
});

app.post('/backup', async (_req, res, next) => {
  const backupDirectory = path.join(__dirname, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `inventory-${timestamp}.sqlite`;
  const backupPath = path.join(backupDirectory, fileName);

  try {
    fs.mkdirSync(backupDirectory, { recursive: true });
    await db.backup(backupPath);
    return res.status(201).json({ message: 'El respaldo se generó correctamente.', backup: fileName });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, _next) => {
  const statusCode = error.status === 400 && 'body' in error
    ? 400
    : error.type === 'entity.too.large'
      ? 413
      : 500;
  const endpoint = req.route
    ? `${req.baseUrl || ''}${req.route.path}`
    : req.path;
  recordException(error, { endpoint, method: req.method, statusCode });

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no contiene JSON válido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la solicitud supera el tamaño permitido.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`Inventario disponible en http://localhost:${port}`);
  });

  async function stopServer(signal) {
    server.close(async (error) => {
      try {
        await shutdownTelemetry();
      } catch (shutdownError) {
        console.error('Error al cerrar OpenTelemetry:', shutdownError);
        process.exitCode = 1;
      }
      if (error) {
        console.error(`Error al cerrar el servidor tras ${signal}:`, error);
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', () => stopServer('SIGINT'));
  process.once('SIGTERM', () => stopServer('SIGTERM'));
}

module.exports = app;
