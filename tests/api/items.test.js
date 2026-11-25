'use strict';

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../../server');

const boundaryLengths = [3, 4, 10, 11, 30, 31, 99, 100];
const invalidLengths = [0, 1, 2, 101, 102, 150];

function validItem(name = 'Valid Item', description = 'Valid description') {
  return { name, description };
}

function sendJson(method, url, body) {
  const testRequest = request(app)[method](url).set('Content-Type', 'application/json');
  return body === undefined ? testRequest : testRequest.send(JSON.stringify(body));
}

function itemAtLengths(nameLength, descriptionLength) {
  return validItem('n'.repeat(nameLength), 'd'.repeat(descriptionLength));
}

function makeItems(count) {
  return Array.from({ length: count }, (_value, index) => {
    const number = String(index + 1).padStart(4, '0');
    return validItem(`Item ${number}`, `Description ${number}`);
  });
}

const validNames = [
  'Árbol', 'niño', '日本語', 'A 2', 'A.B', 'A-B', 'A_B', "A'B", 'A’B',
  '(abc)', 'A  B', '123', 'a-b_c', "O'Reilly", 'Éxito 2026', 'abc',
  'Abc 1', 'A__B', 'A---B', 'A...B', 'Ñandú', '中文测试', 'a (b)', 'Café'
];

const validDescriptions = [
  'abc', 'A/B', 'A+B', 'A#B', 'A@B', 'A&B', 'A%B', 'A:B', 'A;B', 'A,B',
  'A.B', 'A_B', 'A-B', 'A(B)', "A'B", 'A"B', 'A’B', 'A“B', 'A”B',
  'A!B?', 'A / B', 'Café y té', 'Descripción 2026', 'abc...'
];

const invalidNames = [
  'abc@', 'abc$', 'abc,', 'abc:', 'abc!', 'abc+', 'abc#', 'abc%', 'abc&',
  'abc/', 'abc\\', 'abc*'
];

const invalidDescriptions = [
  'abc$', 'abc[', 'abc]', 'abc\\', 'abc*', 'abc=', 'abc{', 'abc}', 'abc|',
  'abc~', 'abc<', 'abc>'
];

const missingOrWrongBodies = [
  { label: 'missing body', body: undefined },
  { label: 'null body', body: null },
  { label: 'string body', body: 'not-an-object' },
  { label: 'numeric body', body: 42 },
  { label: 'boolean body', body: true },
  { label: 'array body', body: [] },
  { label: 'empty object', body: {} },
  { label: 'missing name', body: { description: 'Valid description' } },
  { label: 'missing description', body: { name: 'Valid Item' } },
  { label: 'null name', body: { name: null, description: 'Valid description' } },
  { label: 'numeric name', body: { name: 7, description: 'Valid description' } },
  { label: 'boolean name', body: { name: false, description: 'Valid description' } },
  { label: 'array name', body: { name: [], description: 'Valid description' } },
  { label: 'null description', body: { name: 'Valid Item', description: null } },
  { label: 'numeric description', body: { name: 'Valid Item', description: 7 } },
  { label: 'object description', body: { name: 'Valid Item', description: {} } }
];

const invalidBulkPayloads = [
  { label: 'missing body', body: undefined },
  { label: 'null body', body: null },
  { label: 'string body', body: 'not-an-array' },
  { label: 'numeric body', body: 7 },
  { label: 'boolean body', body: false },
  { label: 'object body', body: {} },
  { label: 'items wrapper', body: { items: [validItem()] } },
  { label: 'empty array', body: [] },
  { label: 'null entry', body: [null] },
  { label: 'array entry', body: [[]] },
  { label: 'numeric entry', body: [7] },
  { label: 'string entry', body: ['item'] },
  { label: 'missing fields entry', body: [{}] },
  { label: 'name only entry', body: [{ name: 'Valid Item' }] },
  { label: 'description only entry', body: [{ description: 'Valid description' }] },
  { label: 'nested array', body: [[validItem()]] },
  { label: 'two invalid entries', body: [null, 7] },
  { label: 'mixed valid and wrong body', body: [validItem(), 'bad'] },
  { label: 'name wrong type', body: [{ name: 9, description: 'Valid description' }] },
  { label: 'description wrong type', body: [{ name: 'Valid Item', description: false }] }
];

const invalidBulkItems = [
  { name: '', description: 'Valid description' },
  { name: 'x', description: 'Valid description' },
  { name: 'xy', description: 'Valid description' },
  { name: 'n'.repeat(101), description: 'Valid description' },
  { name: 'n'.repeat(102), description: 'Valid description' },
  { name: 'n'.repeat(150), description: 'Valid description' },
  { name: 'Valid Item', description: '' },
  { name: 'Valid Item', description: 'x' },
  { name: 'Valid Item', description: 'xy' },
  { name: 'Valid Item', description: 'd'.repeat(101) },
  { name: 'Valid Item', description: 'd'.repeat(102) },
  { name: 'Valid Item', description: 'd'.repeat(150) },
  { name: 'Bad@Name', description: 'Valid description' },
  { name: 'Bad,Name', description: 'Valid description' },
  { name: 'Valid Item', description: 'Bad$Description' },
  { name: 'Valid Item', description: 'Bad[Description' },
  { name: 'Bad\nName', description: 'Valid description' },
  { name: 'Valid Item', description: 'Bad\nDescription' },
  { name: null, description: 'Valid description' },
  { name: 'Valid Item', description: null },
  { name: 5, description: 'Valid description' },
  { name: 'Valid Item', description: 5 },
  { description: 'Valid description' },
  { name: 'Valid Item' }
];

const invalidIds = [
  '0', '-1', '1.2', 'abc', '999999999999999999999999', '01', '+1', '1e2',
  'NaN', 'Infinity', ' ', 'bad id', '0001', '1.0', '0x10', '0b10',
  '1_0', '123abc', '9223372036854775808', '0.5'
];

const bulkBoundaryCases = [
  itemAtLengths(3, 3),
  itemAtLengths(3, 100),
  itemAtLengths(100, 3),
  itemAtLengths(100, 100),
  itemAtLengths(4, 99),
  itemAtLengths(99, 4),
  itemAtLengths(10, 11),
  itemAtLengths(11, 10),
  itemAtLengths(30, 31),
  itemAtLengths(31, 30),
  itemAtLengths(50, 50),
  itemAtLengths(99, 100)
];

beforeEach(async () => {
  const response = await request(app).delete('/items/truncate');
  expect(response.status).toBe(200);
});

describe('health, list, count and last-item endpoints', () => {
  test('GET /api/health reports a healthy API', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', message: expect.any(String) });
  });

  test('GET /items returns an empty array when there are no records', async () => {
    const response = await request(app).get('/items');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test.each([0, 1, 2, 5, 10, 100, 650])(
    'GET /items/count reports %i stored records',
    async (size) => {
      if (size) {
        const created = await request(app).post('/items/bulk').send(makeItems(size));
        expect(created.status).toBe(201);
      }
      const response = await request(app).get('/items/count');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ count: size });
    }
  );

  test.each([0, 1, 2, 10])(
    'GET /items/last handles a catalog with %i records',
    async (size) => {
      if (size) await request(app).post('/items/bulk').send(makeItems(size));
      const response = await request(app).get('/items/last');
      expect(response.status).toBe(200);
      if (!size) {
        expect(response.body).toBeNull();
      } else {
        expect(response.body).toMatchObject({
          id: size,
          name: `Item ${String(size).padStart(4, '0')}`
        });
      }
    }
  );
});

describe('POST /items validation and creation', () => {
  test.each(boundaryLengths.flatMap((nameLength) =>
    boundaryLengths.map((descriptionLength) => [nameLength, descriptionLength])
  ))(
    'accepts name length %i and description length %i',
    async (nameLength, descriptionLength) => {
      const item = itemAtLengths(nameLength, descriptionLength);
      const response = await request(app).post('/items').send(item);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(item);
      expect(response.body.id).toEqual(expect.any(Number));
    }
  );

  test.each(validNames)('accepts valid name characters in %s', async (name) => {
    const item = validItem(name, 'Valid description');
    const response = await request(app).post('/items').send(item);
    expect(response.status).toBe(201);
    expect(response.body.name).toBe(name);
  });

  test.each(validDescriptions)('accepts valid description characters in %s', async (description) => {
    const item = validItem('Valid Item', description);
    const response = await request(app).post('/items').send(item);
    expect(response.status).toBe(201);
    expect(response.body.description).toBe(description);
  });

  test.each(invalidLengths)('rejects a name of length %i', async (length) => {
    const response = await request(app).post('/items').send(validItem('n'.repeat(length)));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/nombre/i);
  });

  test.each(invalidLengths)('rejects a description of length %i', async (length) => {
    const response = await request(app).post('/items').send(validItem('Valid Item', 'd'.repeat(length)));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/descripción/i);
  });

  test.each(invalidNames)('rejects invalid name characters in %s', async (name) => {
    const response = await request(app).post('/items').send(validItem(name));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/nombre/i);
  });

  test.each(invalidDescriptions)('rejects invalid description characters in %s', async (description) => {
    const response = await request(app).post('/items').send(validItem('Valid Item', description));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/descripción/i);
  });

  test.each(missingOrWrongBodies)('rejects $label', async ({ body }) => {
    const response = await sendJson('post', '/items', body);
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
  });
});

describe('PUT /items/:id validation and update', () => {
  test.each(boundaryLengths.flatMap((nameLength) =>
    boundaryLengths.map((descriptionLength) => [nameLength, descriptionLength])
  ))(
    'updates to name length %i and description length %i',
    async (nameLength, descriptionLength) => {
      const created = await request(app).post('/items').send(validItem());
      const item = itemAtLengths(nameLength, descriptionLength);
      const response = await request(app).put(`/items/${created.body.id}`).send(item);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(item);
    }
  );

  test.each(invalidLengths)('rejects an updated name of length %i', async (length) => {
    const created = await request(app).post('/items').send(validItem());
    const response = await request(app).put(`/items/${created.body.id}`)
      .send(validItem('n'.repeat(length)));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/nombre/i);
  });

  test.each(invalidLengths)('rejects an updated description of length %i', async (length) => {
    const created = await request(app).post('/items').send(validItem());
    const response = await request(app).put(`/items/${created.body.id}`)
      .send(validItem('Valid Item', 'd'.repeat(length)));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/descripción/i);
  });

  test.each(invalidNames)('rejects invalid updated name characters in %s', async (name) => {
    const created = await request(app).post('/items').send(validItem());
    const response = await request(app).put(`/items/${created.body.id}`).send(validItem(name));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/nombre/i);
  });

  test.each(invalidDescriptions)('rejects invalid updated description characters in %s', async (description) => {
    const created = await request(app).post('/items').send(validItem());
    const response = await request(app).put(`/items/${created.body.id}`)
      .send(validItem('Valid Item', description));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/descripción/i);
  });

  test.each(missingOrWrongBodies)('rejects update with $label', async ({ body }) => {
    const created = await request(app).post('/items').send(validItem());
    const response = await sendJson('put', `/items/${created.body.id}`, body);
    expect(response.status).toBe(400);
  });
});

describe('ID routes and not-found behavior', () => {
  test.each(invalidIds.flatMap((id) => ['get', 'put', 'delete'].map((method) => [id, method])))(
    '%s ID is rejected by %s /items/:id',
    async (id, method) => {
      const url = `/items/${encodeURIComponent(id)}`;
      const call = request(app)[method](url);
      if (method === 'put') call.send(validItem());
      const response = await call;
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/ID/i);
    }
  );

  test.each(['get', 'put', 'delete'])(
    '%s returns 404 for a valid but nonexistent ID',
    async (method) => {
      const call = request(app)[method]('/items/999999');
      if (method === 'put') call.send(validItem());
      const response = await call;
      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/no encontrado/i);
    }
  );
});

describe('POST /items/bulk validation and atomicity', () => {
  test.each([1, 2, 5, 25, 100, 650])(
    'creates %i valid records in one transaction',
    async (size) => {
      const response = await request(app).post('/items/bulk').send(makeItems(size));
      expect(response.status).toBe(201);
      expect(response.body.created).toBe(size);
      expect(response.body.items).toHaveLength(size);
      const count = await request(app).get('/items/count');
      expect(count.body.count).toBe(size);
    }
  );

  test.each(invalidBulkPayloads)('rejects bulk payload: $label', async ({ body }) => {
    const response = await sendJson('post', '/items/bulk', body);
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
    expect((await request(app).get('/items')).body).toHaveLength(0);
  });

  test.each(invalidBulkItems)('rejects invalid bulk item %j atomically', async (invalidItem) => {
    const response = await request(app).post('/items/bulk')
      .send([validItem(), invalidItem]);
    expect(response.status).toBe(400);
    expect((await request(app).get('/items/count')).body.count).toBe(0);
  });

  test.each(bulkBoundaryCases)('accepts bulk field boundaries %j', async (item) => {
    const response = await request(app).post('/items/bulk').send([item]);
    expect(response.status).toBe(201);
    expect(response.body.items[0]).toMatchObject(item);
  });
});

describe('DELETE /items/clear and /items/truncate', () => {
  test.each([0, 1, 3, 10, 50, 100])(
    'clear removes %i records and keeps IDs monotonic',
    async (size) => {
      if (size) await request(app).post('/items/bulk').send(makeItems(size));
      const response = await request(app).delete('/items/clear');
      expect(response.status).toBe(200);
      expect(response.body.deleted).toBe(size);
      const created = await request(app).post('/items').send(validItem());
      expect(created.status).toBe(201);
      expect(created.body.id).toBe(size + 1);
    }
  );

  test.each([0, 1, 3, 10, 50, 100])(
    'truncate removes %i records and resets the ID sequence',
    async (size) => {
      if (size) await request(app).post('/items/bulk').send(makeItems(size));
      const response = await request(app).delete('/items/truncate');
      expect(response.status).toBe(200);
      expect(response.body.deleted).toBe(size);
      const created = await request(app).post('/items').send(validItem());
      expect(created.status).toBe(201);
      expect(created.body.id).toBe(1);
    }
  );
});

describe('complete CRUD round trips', () => {
  test.each(Array.from({ length: 20 }, (_value, index) => index + 1))(
    'creates, reads, updates and deletes round-trip item %i',
    async (index) => {
      const item = validItem(`Round Trip ${index}`, `Round trip description ${index}`);
      const created = await request(app).post('/items').send(item);
      expect(created.status).toBe(201);

      const read = await request(app).get(`/items/${created.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject(item);

      const updatedItem = validItem(`Updated Item ${index}`, `Updated description ${index}`);
      const updated = await request(app).put(`/items/${created.body.id}`).send(updatedItem);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject(updatedItem);

      const deleted = await request(app).delete(`/items/${created.body.id}`);
      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({ deleted: true, id: created.body.id });
      expect((await request(app).get(`/items/${created.body.id}`)).status).toBe(404);
    }
  );
});

describe('backup and global request errors', () => {
  test('POST /backup writes a SQLite backup file', async () => {
    const response = await request(app).post('/backup');
    expect(response.status).toBe(201);
    expect(response.body.backup).toMatch(/^inventory-.*\.sqlite$/);
    const backupPath = path.join(__dirname, '..', '..', 'backups', response.body.backup);
    expect(fs.existsSync(backupPath)).toBe(true);
    fs.rmSync(backupPath, { force: true });
  });

  test('POST /backup converts filesystem errors to JSON 500 responses', async () => {
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      throw new Error('simulated backup error');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app).post('/backup');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Error interno del servidor.' });
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      mkdirSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  test('malformed JSON receives a 400 response', async () => {
    const response = await request(app).post('/items')
      .set('Content-Type', 'application/json')
      .send('{ invalid');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/JSON válido/i);
  });

  test('JSON bodies larger than the configured limit receive 413', async () => {
    const response = await request(app).post('/items')
      .set('Content-Type', 'application/json')
      .send(`"${'x'.repeat(1024 * 1024)}"`);
    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/tamaño permitido/i);
  });
});
