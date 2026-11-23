'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const invalidNames = ['', 'a', 'ab'];
const blockedNameInputs = [
  ['ab@', '@'], ['ab$', '$'], ['ab,', ','], ['ab:', ':'], ['ab!', '!'],
  ['ab+', '+'], ['ab#', '#'], ['ab%', '%'], ['ab&', '&'], ['ab/', '/'],
  ['ab\\', '\\'], ['ab*', '*'], ['ab=', '='], ['ab[', '['], ['ab]', ']'],
  ['ab|', '|'], ['ab~', '~']
];

const invalidDescriptions = ['', 'a', 'ab', 'ab\nc'];
const blockedDescriptionInputs = [
  ['ab$', '$'], ['ab[', '['], ['ab]', ']'], ['ab\\', '\\'], ['ab*', '*'],
  ['ab=', '='], ['ab{', '{'], ['ab}', '}'], ['ab|', '|'], ['ab~', '~'],
  ['ab<', '<'], ['ab>', '>'], ['ab`', '`'], ['ab^', '^']
];
const validSpecialDescriptions = ['contact@item', '100% cotton'];

const validCreateNames = [
  'Monitor Pro', 'Café', '日本語', '123', 'A_B', 'A-B',
  "O'Neil", 'A’B', 'A.B', '(abc)', 'Árbol 7', 'A 2'
];

const invalidEditNames = ['', 'a', 'ab'];
const blockedEditNames = [['bad@name', '@'], ['bad,name', ','], ['bad$name', '$']];
const invalidEditDescriptions = ['', 'a', 'ab'];
const blockedEditDescriptions = [['bad$desc', '$'], ['bad[desc', '['], ['bad\\desc', '\\']];
const validEditItems = Array.from({ length: 8 }, (_value, index) => ({
  name: `Edited item ${index + 1}`,
  description: `Edited description ${index + 1}`
}));

const malformedBulkInputs = [
  '', '[', '{', '{"name":', '[{}]', '[not json]', '{"name":"Valid Item"}',
  '{"name":"ab","description":"Valid description"}', 'not comma separated',
  'One field only', 'ab,description', 'Bad@Name, valid description',
  'Valid name, bad$description', 'null', 'true', '7', '""', '[]',
  '[null]', '[{"name":5,"description":"Valid description"}]'
];

const validBulkInputs = [
  { value: JSON.stringify([{ name: 'JSON Item', description: 'JSON description' }]), count: 1 },
  { value: JSON.stringify([
    { name: 'First Item', description: 'First description' },
    { name: 'Second Item', description: 'Second description' }
  ]), count: 2 },
  { value: JSON.stringify({ name: 'Single Object', description: 'Single description' }), count: 1 },
  { value: 'CSV Item,CSV description', count: 1 },
  { value: 'Comma Item,description, with comma', count: 1 },
  { value: 'Line One,First description\nLine Two,Second description', count: 2 }
];

const searchCases = [
  ['alpha', 2], ['ALPHA', 2], ['component', 2], ['red', 1],
  ['gamma', 1], ['3', 1], ['missing', 0], ['', 3]
];

const sortCases = [
  ['id-asc', ['Zulu Item', 'Bravo Item', 'Alpha Item']],
  ['id-desc', ['Alpha Item', 'Bravo Item', 'Zulu Item']],
  ['name-asc', ['Alpha Item', 'Bravo Item', 'Zulu Item']],
  ['name-desc', ['Zulu Item', 'Bravo Item', 'Alpha Item']]
];

const viewportCases = [320, 360, 375, 390, 430, 480, 640, 760, 768, 1024, 1280, 1440];
const bulkSizes = [1, 2, 3, 5, 10, 20, 25, 100];
const toolCases = ['backup', 'clear', 'truncate'];

function each(title, cases, run) {
  for (const [index, parameter] of cases.entries()) {
    const values = Array.isArray(parameter) ? parameter : [parameter];
    const label = typeof parameter === 'string'
      ? JSON.stringify(parameter).slice(0, 48)
      : typeof parameter === 'number'
        ? String(parameter)
        : parameter.label || parameter.name || `case ${index + 1}`;
    test(`${title} [${label}]`, async ({ page, request }) => run({ page, request }, ...values));
  }
}

async function createItem(page, name = 'Test Item', description = 'Test description') {
  await page.getByTestId('dashboard-create-button').click();
  await page.getByTestId('item-name').fill(name);
  await page.getByTestId('item-description').fill(description);
  await page.getByTestId('save-item-button').click();
  await expect(page.getByTestId('toast-alert')).toContainText('creó correctamente');
}

async function seedItems(request, items) {
  const response = await request.post('/items/bulk', { data: items });
  expect(response.status()).toBe(201);
  return response.json();
}

test.beforeEach(async ({ page, request }) => {
  const reset = await request.delete('/items/truncate');
  expect(reset.status()).toBe(200);
  await page.goto('/');
  await expect(page.getByTestId('health-status')).toContainText('En línea');
});

test.describe('layout, navigation and dashboard', () => {
  each('opens tab and displays its section', [
    ['tab-dashboard', 'dashboard-view', 'Tu inventario, de un vistazo'],
    ['tab-catalog', 'catalog-view', 'Catálogo de ítems'],
    ['tab-bulk', 'bulk-view', 'Carga masiva'],
    ['tab-tools', 'tools-view', 'Herramientas']
  ], async ({ page }, tab, view, heading) => {
    await page.getByTestId(tab).click();
    await expect(page.getByTestId(view)).toBeVisible();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  });

  test('shows live health, count and last-item KPIs', async ({ page }) => {
    await expect(page.locator('#health-status')).toContainText('En línea');
    await expect(page.locator('#items-count')).toHaveText('0');
    await expect(page.locator('#last-item-card')).toContainText('Sin registros todavía');
  });

  test('shows the empty dashboard state before records exist', async ({ page }) => {
    await expect(page.getByTestId('dashboard-empty-state')).toBeVisible();
    await expect(page.getByTestId('dashboard-empty-state')).toContainText('Aún no hay ítems');
  });

  test('switches from light theme to dark theme', async ({ page }) => {
    await page.getByTestId('toggle-theme').click();
    await expect(page.locator('body')).toHaveClass(/dark-mode/);
    await expect(page.getByTestId('toggle-theme')).toContainText('Modo claro');
  });

  test('switches from dark theme back to light theme', async ({ page }) => {
    await page.getByTestId('toggle-theme').click();
    await page.getByTestId('toggle-theme').click();
    await expect(page.locator('body')).not.toHaveClass(/dark-mode/);
    await expect(page.getByTestId('toggle-theme')).toContainText('Modo oscuro');
  });
});

test.describe('creation form validation', () => {
  each('shows name validation', invalidNames, async ({ page }, name) => {
    await page.getByTestId('dashboard-create-button').click();
    await page.getByTestId('item-name').fill(name);
    await page.getByTestId('item-description').fill('Valid description');
    await page.getByTestId('save-item-button').click();
    await expect(page.getByTestId('error-name')).not.toBeEmpty();
    await expect(page.getByTestId('item-modal')).toBeVisible();
  });

  each('blocks invalid name characters', blockedNameInputs, async ({ page }, input, character) => {
    await page.getByTestId('dashboard-create-button').click();
    const nameInput = page.getByTestId('item-name');
    await nameInput.fill(input);
    expect(await nameInput.inputValue()).not.toContain(character);
  });

  each('shows description validation', invalidDescriptions, async ({ page }, description) => {
    await page.getByTestId('dashboard-create-button').click();
    await page.getByTestId('item-name').fill('Valid item');
    await page.getByTestId('item-description').fill(description);
    await page.getByTestId('save-item-button').click();
    await expect(page.getByTestId('error-description')).not.toBeEmpty();
    await expect(page.getByTestId('item-modal')).toBeVisible();
  });

  each('blocks invalid description characters', blockedDescriptionInputs, async ({ page }, input, character) => {
    await page.getByTestId('dashboard-create-button').click();
    const descriptionInput = page.getByTestId('item-description');
    await descriptionInput.fill(input);
    expect(await descriptionInput.inputValue()).not.toContain(character);
  });

  each('creates a valid item', validCreateNames, async ({ page }, name) => {
    await createItem(page, name, 'Valid description');
    await expect(page.getByTestId('items-count')).toHaveText('1');
    await page.getByTestId('tab-catalog').click();
    await expect(page.getByTestId('view-item-1')).toBeVisible();
  });

  each('accepts supported special description characters', validSpecialDescriptions, async ({ page }, description) => {
    await createItem(page, 'Valid item', description);
    await expect(page.getByTestId('items-count')).toHaveText('1');
  });
});

test.describe('edit form validation', () => {
  each('rejects invalid edited name', invalidEditNames, async ({ page }, name) => {
    await createItem(page);
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('edit-item-1').click();
    await page.getByTestId('item-name').fill(name);
    await page.getByTestId('save-item-button').click();
    await expect(page.getByTestId('error-name')).not.toBeEmpty();
    await expect(page.getByTestId('item-modal')).toBeVisible();
  });

  each('blocks invalid characters in edited names', blockedEditNames, async ({ page }, input, character) => {
    await createItem(page);
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('edit-item-1').click();
    const nameInput = page.getByTestId('item-name');
    await nameInput.fill(input);
    expect(await nameInput.inputValue()).not.toContain(character);
  });

  each('rejects invalid edited description', invalidEditDescriptions, async ({ page }, description) => {
    await createItem(page);
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('edit-item-1').click();
    await page.getByTestId('item-description').fill(description);
    await page.getByTestId('save-item-button').click();
    await expect(page.getByTestId('error-description')).not.toBeEmpty();
    await expect(page.getByTestId('item-modal')).toBeVisible();
  });

  each('blocks invalid characters in edited descriptions', blockedEditDescriptions, async ({ page }, input, character) => {
    await createItem(page);
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('edit-item-1').click();
    const descriptionInput = page.getByTestId('item-description');
    await descriptionInput.fill(input);
    expect(await descriptionInput.inputValue()).not.toContain(character);
  });

  each('saves a valid edit', validEditItems, async ({ page }, item) => {
    await createItem(page);
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('edit-item-1').click();
    await page.getByTestId('item-name').fill(item.name);
    await page.getByTestId('item-description').fill(item.description);
    await page.getByTestId('save-item-button').click();
    await expect(page.getByTestId('toast-alert')).toContainText('actualizó correctamente');
    await expect(page.locator('#items-count')).toHaveText('1');
    await expect(page.getByTestId('edit-item-1')).toBeVisible();
  });
});

test.describe('catalog CRUD flow', () => {
  each(
    'completes search, sort, detail, edit and delete flow',
    Array.from({ length: 12 }, (_value, index) => index + 1),
    async ({ page }, index) => {
      const primary = `Primary Item ${index}`;
      const secondary = `Secondary Item ${index}`;
      await createItem(page, primary, `Primary description ${index}`);
      await createItem(page, secondary, `Secondary description ${index}`);

      await page.getByTestId('tab-catalog').click();
      await page.getByTestId('sort-select').selectOption('name-desc');
      const initialOrder = await page.locator('#items-table-body .item-cell strong').allTextContents();
      expect(initialOrder).toEqual([secondary, primary]);

      await page.getByTestId('search-input').fill(primary);
      await page.getByTestId('view-item-1').click();
      await expect(page.getByTestId('detail-modal')).toContainText(primary);
      await page.getByTestId('detail-close-button').click();

      await page.getByTestId('edit-item-1').click();
      await page.getByTestId('item-name').fill(`Edited Item ${index}`);
      await page.getByTestId('item-description').fill(`Edited description ${index}`);
      await page.getByTestId('save-item-button').click();
      await expect(page.getByTestId('toast-alert')).toContainText('actualizó correctamente');
      await page.getByTestId('search-input').fill(`Edited Item ${index}`);
      await expect(page.getByTestId('edit-item-1')).toBeVisible();

      await page.getByTestId('delete-item-1').click();
      await page.getByTestId('confirm-cancel').click();
      await expect(page.getByTestId('delete-item-1')).toBeVisible();
      await page.getByTestId('delete-item-1').click();
      await page.getByTestId('confirm-accept').click();
      await expect(page.getByTestId('toast-alert')).toContainText('eliminó correctamente');

      await page.getByTestId('search-input').fill('');
      await page.getByTestId('delete-item-2').click();
      await page.getByTestId('confirm-accept').click();
      await expect(page.getByTestId('empty-state')).toBeVisible();
    }
  );
});

test.describe('catalog search and ordering', () => {
  each('filters by query and returns expected matches', searchCases, async ({ page, request }, query, count) => {
    await seedItems(request, [
      { name: 'Alpha Item', description: 'Red component' },
      { name: 'Beta Item', description: 'Alpha component' },
      { name: 'Gamma Piece', description: 'Blue object' }
    ]);
    await page.reload();
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('search-input').fill(query);
    await expect(page.getByTestId('results-summary')).toContainText(`${count} ${count === 1 ? 'ítem' : 'ítems'}`);
  });

  each('sorts records', sortCases, async ({ page, request }, sort, expectedOrder) => {
    await seedItems(request, [
      { name: 'Zulu Item', description: 'Third description' },
      { name: 'Bravo Item', description: 'Second description' },
      { name: 'Alpha Item', description: 'First description' }
    ]);
    await page.reload();
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('sort-select').selectOption(sort);
    const names = await page.locator('#items-table-body .item-cell strong').allTextContents();
    expect(names).toEqual(expectedOrder);
  });
});

test.describe('catalog pagination', () => {
  each('displays configured rows per page', [5, 10, 20], async ({ page, request }, pageSize) => {
    const items = Array.from({ length: pageSize + 1 }, (_value, index) => ({
      name: `Page Item ${String(index + 1).padStart(2, '0')}`,
      description: `Page description ${index + 1}`
    }));
    await seedItems(request, items);
    await page.reload();
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('page-size').selectOption(String(pageSize));
    await expect(page.locator('#items-table-body tr')).toHaveCount(pageSize);
    await expect(page.getByTestId('pagination-info')).toContainText(`de ${pageSize + 1}`);
    await expect(page.getByTestId('next-page')).toBeEnabled();
  });

  test('moves to the next catalog page', async ({ page, request }) => {
    await seedItems(request, Array.from({ length: 12 }, (_value, index) => ({
      name: `Page Item ${String(index + 1).padStart(2, '0')}`,
      description: `Page description ${index + 1}`
    })));
    await page.reload();
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('page-size').selectOption('5');
    await page.getByTestId('next-page').click();
    await expect(page.getByTestId('pagination-info')).toHaveText('6–10 de 12');
    await expect(page.getByTestId('previous-page')).toBeEnabled();
  });

  test('returns to the previous catalog page', async ({ page, request }) => {
    await seedItems(request, Array.from({ length: 12 }, (_value, index) => ({
      name: `Page Item ${String(index + 1).padStart(2, '0')}`,
      description: `Page description ${index + 1}`
    })));
    await page.reload();
    await page.getByTestId('tab-catalog').click();
    await page.getByTestId('page-size').selectOption('5');
    await page.getByTestId('next-page').click();
    await page.getByTestId('previous-page').click();
    await expect(page.getByTestId('pagination-info')).toHaveText('1–5 de 12');
  });
});

test.describe('bulk import', () => {
  each('shows an error for malformed bulk input', malformedBulkInputs, async ({ page, request }, input) => {
    await page.getByTestId('tab-bulk').click();
    await page.getByTestId('bulk-input').fill(input);
    await page.getByTestId('bulk-submit-button').click();
    await expect(page.getByTestId('bulk-error')).not.toBeEmpty();
    const count = await request.get('/items/count').then((response) => response.json());
    expect(count.count).toBe(0);
  });

  each('imports a valid bulk format', validBulkInputs, async ({ page }, bulk) => {
    await page.getByTestId('tab-bulk').click();
    await page.getByTestId('bulk-input').fill(bulk.value);
    await page.getByTestId('bulk-submit-button').click();
    await expect(page.getByTestId('toast-alert')).toContainText('importado');
    await expect(page.locator('#items-count')).toHaveText(String(bulk.count));
  });

  each('imports a batch in the browser', bulkSizes, async ({ page }, size) => {
    const items = Array.from({ length: size }, (_value, index) => ({
      name: `Bulk Item ${index + 1}`,
      description: `Bulk description ${index + 1}`
    }));
    await page.getByTestId('tab-bulk').click();
    await page.getByTestId('bulk-input').fill(JSON.stringify(items));
    await page.getByTestId('bulk-submit-button').click();
    await expect(page.locator('#items-count')).toHaveText(String(size));
    await expect(page.getByTestId('toast-alert')).toContainText('importado');
  });
});

test.describe('maintenance confirmations and results', () => {
  each('tool can be cancelled without changing records', toolCases, async ({ page, request }, tool) => {
    await seedItems(request, [{ name: 'Keep Item', description: 'Keep this record' }]);
    await page.getByTestId('tab-tools').click();
    const button = {
      backup: 'backup-button',
      clear: 'clear-items-button',
      truncate: 'truncate-items-button'
    }[tool];
    await page.getByTestId(button).click();
    await page.getByTestId('confirm-cancel').click();
    const count = await request.get('/items/count').then((response) => response.json());
    expect(count.count).toBe(1);
  });

  each('tool succeeds after confirmation and shows a toast', toolCases, async ({ page, request }, tool) => {
    await seedItems(request, [{ name: 'Tool Item', description: 'Tool test record' }]);
    await page.getByTestId('tab-tools').click();
    const button = {
      backup: 'backup-button',
      clear: 'clear-items-button',
      truncate: 'truncate-items-button'
    }[tool];
    await page.getByTestId(button).click();
    const backupResponse = tool === 'backup'
      ? page.waitForResponse((response) =>
        response.url().endsWith('/backup') && response.request().method() === 'POST')
      : null;
    await page.getByTestId('confirm-accept').click();
    const expectedMessage = {
      backup: 'respaldo se generó correctamente',
      clear: 'registros se limpiaron correctamente',
      truncate: 'inventario se truncó correctamente'
    }[tool];
    await expect(page.getByTestId('toast-alert')).toContainText(expectedMessage);
    if (backupResponse) {
      const backup = await (await backupResponse).json();
      const backupPath = path.join(__dirname, '..', '..', 'backups', backup.backup);
      fs.rmSync(backupPath, { force: true });
    }
    if (tool !== 'backup') {
      const count = await request.get('/items/count').then((response) => response.json());
      expect(count.count).toBe(0);
    }
  });
});

test.describe('responsive layout', () => {
  each('fits the app at viewport width', viewportCases, async ({ page }, width) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Tu inventario, de un vistazo' })).toBeVisible();
    const fitsViewport = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fitsViewport).toBe(true);
  });
});
