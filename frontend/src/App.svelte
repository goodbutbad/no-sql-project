<script>
  // ── Svelte 5 Runes ──────────────────────────────────────────────
  const API = 'http://localhost:3001';

  // Navigation
  let activeTab = $state('queries');

  // ── TAB 1: Запросы ───────────────────────────────────────────────
  let queryText = $state('ТАНДА * ИЧИНЕН users');
  let queryResult = $state(null);
  let queryError = $state('');
  let queryLoading = $state(false);
  let queryHistory = $state([]);

  const exampleQueries = [
    'ТАБЛИЦАЛАРДЫ КӨРСӨТ',
    'ТАНДА * ИЧИНЕН users',
    'ТАНДА name, age ИЧИНЕН users КАЙДА age > 25',
    'ТАНДА * ИЧИНЕН users КАЙДА city КАМТЫЙТ Бишкек',
    'ИЧИНЕ КОШ users (id, name, age, email, city) МААНИЛЕР (6, \'Сергей\', 27, \'sergey@mail.ru\', \'Екатеринбург\')',
    'ЖАҢЫЛА users ОРНОТ city=\'Нарын\' КАЙДА id=3',
    'ТАНДА * ИЧИНЕН orders КАЙДА amount >= 10000',
    'ТАБЛИЦА ТҮЗ products (id, name, price, category)',
    'ИЧИНЕН ӨЧҮР products КАЙДА id=1',
    'ЭКСПОРТ users В CSV',
  ];

  async function runQuery() {
    if (!queryText.trim()) return;
    queryLoading = true;
    queryError = '';
    queryResult = null;

    // Check if export command — redirect to export-file
    const isExport = /^ЭКСПОРТ\s+\S+\s+В\s+(EXCEL|CSV|XLSX)/i.test(queryText.trim());

    try {
      if (isExport) {
        await downloadExport(queryText.trim());
        queryResult = { success: true, message: 'Файл экспортирован и скачан' };
      } else {
        const resp = await fetch(`${API}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryText.trim() })
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);
        queryResult = data;
        // Add to history
        queryHistory = [{ text: queryText.trim(), time: new Date().toLocaleTimeString('ru') }, ...queryHistory.slice(0, 9)];
      }
    } catch (e) {
      queryError = e.message;
    } finally {
      queryLoading = false;
    }
  }

  async function downloadExport(query) {
    const resp = await fetch(`${API}/export-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Ошибка экспорта');
    }
    const disposition = resp.headers.get('Content-Disposition') || '';
    const nameMatch = disposition.match(/filename="?([^"]+)"?/);
    const filename = nameMatch ? nameMatch[1] : 'export';
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleKeydown(e) {
    if (e.ctrlKey && e.key === 'Enter') runQuery();
  }

  // ── TAB 2: Таблицы ───────────────────────────────────────────────
  let tablesList = $state([]);
  let selectedTable = $state(null);
  let tableRows = $state([]);
  let tableColumns = $state([]);
  let tablesLoading = $state(false);
  let tablesError = $state('');
  let newTableName = $state('');
  let newTableCols = $state('');
  let showCreateForm = $state(false);

  const tableRowCount = $derived(tableRows.length);

  async function loadTables() {
    tablesLoading = true;
    tablesError = '';
    try {
      const resp = await fetch(`${API}/tables`);
      const data = await resp.json();
      tablesList = data.tables || [];
    } catch (e) {
      tablesError = 'Не удалось загрузить таблицы';
    } finally {
      tablesLoading = false;
    }
  }

  async function selectTable(name) {
    selectedTable = name;
    tableRows = [];
    tableColumns = [];
    try {
      const resp = await fetch(`${API}/tables/${name}`);
      const data = await resp.json();
      tableRows = data.rows || [];
      tableColumns = data.rows?.length > 0 ? Object.keys(data.rows[0]) : [];
    } catch (e) {
      tablesError = e.message;
    }
  }

  async function createTable() {
    if (!newTableName.trim() || !newTableCols.trim()) return;
    try {
      const cols = newTableCols.split(',').map(c => c.trim()).filter(Boolean);
      const query = `ТАБЛИЦА ТҮЗ ${newTableName.trim()} (${cols.join(', ')})`;
      const resp = await fetch(`${API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      showCreateForm = false;
      newTableName = '';
      newTableCols = '';
      await loadTables();
    } catch (e) {
      tablesError = e.message;
    }
  }

  async function dropTable(name) {
    if (!confirm(`Удалить таблицу "${name}"? Данные будут потеряны.`)) return;
    try {
      const resp = await fetch(`${API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `ТАБЛИЦАНЫ ӨЧҮР ${name}` })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      if (selectedTable === name) {
        selectedTable = null;
        tableRows = [];
        tableColumns = [];
      }
      await loadTables();
    } catch (e) {
      tablesError = e.message;
    }
  }

  // ── TAB 3: CRUD / Экспорт ────────────────────────────────────────
  let crudTable = $state('');
  let crudColumns = $state([]);
  let crudResult = $state(null);
  let crudError = $state('');
  let insertValues = $state({});
  let updateId = $state('');
  let updateValues = $state({});
  let deleteCondition = $state('id=1');
  let crudAllTables = $state([]);

  $effect(() => {
    // Only track activeTab here — prevents reactive loops
    const tab = activeTab;
    if (tab === 'tables') loadTables();
    if (tab === 'crud') loadCrudTables();
  });

  async function loadCrudTables() {
    try {
      const resp = await fetch(`${API}/tables`);
      const data = await resp.json();
      const tables = data.tables || [];
      crudAllTables = tables;
      if (!crudTable && tables.length > 0) {
        crudTable = tables[0].name;
        setCrudColumns(tables[0].columns);
      }
    } catch (e) {}
  }

  function setCrudColumns(columns) {
    const cols = (columns || []).filter(c => c !== 'id');
    crudColumns = cols;
    insertValues = Object.fromEntries(cols.map(c => [c, '']));
    updateValues = Object.fromEntries(cols.map(c => [c, '']));
  }

  // Watch only crudTable — read crudAllTables via .slice() so Svelte
  // does NOT track it as a dependency of this effect (avoids the loop)
  $effect(() => {
    const name = crudTable;
    if (!name) return;
    const snapshot = crudAllTables.slice();
    const found = snapshot.find(t => t.name === name);
    if (found) setCrudColumns(found.columns);
  });

  async function crudInsert() {
    const cols = crudColumns.filter(c => insertValues[c] !== '');
    if (cols.length === 0) { crudError = 'Кеминде бир талаа толтур'; return; }
    const vals = cols.map(c => {
      const v = insertValues[c];
      return isNaN(v) || v === '' ? `'${v}'` : v;
    });
    const query = `ИЧИНЕ КОШ ${crudTable} (${cols.join(', ')}) МААНИЛЕР (${vals.join(', ')})`;
    await crudRun(query);
  }

  async function crudUpdate() {
    const pairs = crudColumns
      .filter(c => updateValues[c] !== '')
      .map(c => {
        const v = updateValues[c];
        return `${c}=${isNaN(v) || v === '' ? `'${v}'` : v}`;
      });
    if (pairs.length === 0 || !updateId) { crudError = 'ID жана жаңыланат талаалар көрсөт'; return; }
    const query = `ЖАҢЫЛА ${crudTable} ОРНОТ ${pairs.join(',')} КАЙДА id=${updateId}`;
    await crudRun(query);
  }

  async function crudDelete() {
    if (!deleteCondition.trim()) { crudError = 'Өчүүчү шарт көрсөт'; return; }
    const query = `ИЧИНЕН ӨЧҮР ${crudTable} КАЙДА ${deleteCondition}`;
    await crudRun(query);
  }

  async function crudRun(query) {
    crudError = '';
    crudResult = null;
    try {
      const resp = await fetch(`${API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      crudResult = data;
    } catch (e) {
      crudError = e.message;
    }
  }

  async function crudExport(format) {
    try {
      await downloadExport(`ЭКСПОРТ ${crudTable} В ${format}`);
      crudResult = { success: true, message: `Файл ${format} скачан` };
    } catch (e) {
      crudError = e.message;
    }
  }
</script>

<div class="app">
  <!-- ── HEADER ── -->
  <header class="header">
    <div class="header-inner">
      <div class="logo">
        <span class="logo-icon">⬡</span>
        <div class="logo-text">
          <span class="logo-main">NoSQL-KG</span>
        </div>
      </div>
      <nav class="nav">
        <button
          class="nav-btn {activeTab === 'queries' ? 'active' : ''}"
          onclick={() => activeTab = 'queries'}
        >
          <span class="nav-icon">⌨</span> Запросы
        </button>
        <button
          class="nav-btn {activeTab === 'tables' ? 'active' : ''}"
          onclick={() => activeTab = 'tables'}
        >
          <span class="nav-icon">◫</span> Таблицалар
        </button>
        <button
          class="nav-btn {activeTab === 'crud' ? 'active' : ''}"
          onclick={() => activeTab = 'crud'}
        >
          <span class="nav-icon">✦</span> CRUD / Экспорт
        </button>
      </nav>
    </div>
  </header>

  <!-- ── MAIN ── -->
  <main class="main">

    <!-- ──────────────── TAB 1: ЗАПРОСЫ ──────────────── -->
    {#if activeTab === 'queries'}
    <div class="tab-content">
      <div class="tab-header">
        <h2>DSL сурамдар редактору</h2>
        <span class="hint">Ctrl+Enter — аткаруу</span>
      </div>

      <div class="queries-layout">
        <div class="query-left">
          <!-- Примеры -->
          <div class="examples-panel">
            <div class="panel-label">Мисал сурамдар</div>
            {#each exampleQueries as ex}
              <button class="example-btn" onclick={() => queryText = ex}>{ex}</button>
            {/each}
          </div>

          <!-- История -->
          {#if queryHistory.length > 0}
          <div class="examples-panel" style="margin-top: 16px">
            <div class="panel-label">Сурамдар тарыхы</div>
            {#each queryHistory as h}
              <button class="example-btn history" onclick={() => queryText = h.text}>
                <span class="history-time">{h.time}</span>
                {h.text}
              </button>
            {/each}
          </div>
          {/if}
        </div>

        <div class="query-right">
          <div class="editor-wrap">
            <textarea
              class="dsl-editor"
              bind:value={queryText}
              onkeydown={handleKeydown}
              placeholder="DSL сурамын киргизиңиз..."
              spellcheck="false"
            ></textarea>
            <div class="editor-footer">
              <button class="run-btn" onclick={runQuery} disabled={queryLoading}>
                {#if queryLoading}
                  <span class="spinner"></span> Аткарылуу...
                {:else}
                  ▶ Аткаруу
                {/if}
              </button>
              <button class="clear-btn" onclick={() => { queryText = ''; queryResult = null; queryError = ''; }}>
                ✕ Тазалоо
              </button>
            </div>
          </div>

          <!-- Result -->
          {#if queryError}
            <div class="result-box error">
              <div class="result-label">❌ Ката</div>
              <div class="error-text">{queryError}</div>
            </div>
          {/if}

          {#if queryResult}
            <div class="result-box success">
              <div class="result-label">
                ✅ Натыйжа
                {#if queryResult.count !== undefined}
                  <span class="result-count">{queryResult.count} жазуу</span>
                {/if}
              </div>

              {#if queryResult.message}
                <div class="result-message">{queryResult.message}</div>
              {/if}

              {#if queryResult.tables}
                <div class="tables-grid">
                  {#each queryResult.tables as t}
                    <div class="table-card">
                      <div class="table-card-name">{t.name}</div>
                      <div class="table-card-info">{t.rowCount} строк · {t.columns.length} колонок</div>
                      <div class="table-card-cols">{t.columns.join(', ')}</div>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if queryResult.rows && queryResult.rows.length > 0}
                <div class="result-table-wrap">
                  <table class="result-table">
                    <thead>
                      <tr>
                        {#each Object.keys(queryResult.rows[0]) as col}
                          <th>{col}</th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each queryResult.rows as row}
                        <tr>
                          {#each Object.values(row) as val}
                            <td>{val ?? '—'}</td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else if queryResult.rows && queryResult.rows.length === 0}
                <div class="empty-result">Жазуу табылган жок</div>
              {/if}

              <details class="json-details">
                <summary>JSON-жооп</summary>
                <pre class="json-pre">{JSON.stringify(queryResult, null, 2)}</pre>
              </details>
            </div>
          {/if}
        </div>
      </div>
    </div>
    {/if}

    <!-- ──────────────── TAB 2: ТАБЛИЦЫ ──────────────── -->
    {#if activeTab === 'tables'}
    <div class="tab-content">
      <div class="tab-header">
        <h2>Таблицалар менеджери</h2>
        <button class="action-btn" onclick={() => showCreateForm = !showCreateForm}>
          + Таблица түзүү
        </button>
      </div>

      {#if showCreateForm}
        <div class="create-form">
          <div class="form-title">Жаңы таблица</div>
          <div class="form-row">
            <div class="field-group">
              <label>Табликанын аты</label>
              <input bind:value={newTableName} placeholder="products" class="field-input" />
            </div>
            <div class="field-group" style="flex: 2">
              <label>Мамычалар (комма аркылуу)</label>
              <input bind:value={newTableCols} placeholder="name, price, category" class="field-input" />
            </div>
            <button class="run-btn" style="align-self: flex-end" onclick={createTable}>Түзүү</button>
            <button class="clear-btn" style="align-self: flex-end" onclick={() => showCreateForm = false}>Бас тартуу</button>
          </div>
        </div>
      {/if}

      {#if tablesError}
        <div class="inline-error">{tablesError}</div>
      {/if}
      

      <div class="tables-layout">
        <!-- Left: table list -->
        <div class="tables-list-panel">
          <div class="panel-label">Таблицалар ({tablesList.length})</div>
          {#if tablesLoading}
            <div class="loading-msg">Жүктөлүүчүдө...</div>
          {:else}
            {#each tablesList as t}
              <div
                class="table-list-item {selectedTable === t.name ? 'selected' : ''}"
                onclick={() => selectTable(t.name)}
              >
                <div class="tli-name">{t.name}</div>
                <div class="tli-meta">{t.rowCount} жазуу</div>
                <button
                  class="tli-delete"
                  onclick={(e) => { e.stopPropagation(); dropTable(t.name); }}
                  title="Таблицаны өчүр"
                >✕</button>
              </div>
            {:else}
              <div class="empty-result">Таблица жок</div>
            {/each}
          {/if}
        </div>

        <!-- Right: table content -->
        <div class="table-content-panel">
          {#if selectedTable}
            <div class="content-header">
              <span class="content-title">⊞ {selectedTable}</span>
              <span class="content-meta">{tableRowCount} жазуу</span>
              <button class="refresh-btn" onclick={() => selectTable(selectedTable)}>↻ Жаңыла</button>
            </div>

            {#if tableRows.length > 0}
              <div class="result-table-wrap">
                <table class="result-table">
                  <thead>
                    <tr>
                      {#each tableColumns as col}
                        <th>{col}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each tableRows as row}
                      <tr>
                        {#each tableColumns as col}
                          <td>{row[col] ?? '—'}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="empty-result">Таблица бош</div>
            {/if}
          {:else}
            <div class="no-selection">
              <div class="no-selection-icon">◫</div>
              <div>Солдон таблицаны тандаңыз</div>
            </div>
          {/if}
        </div>
      </div>
    </div>
    {/if}

    <!-- ──────────────── TAB 3: CRUD / ЭКСПОРТ ──────────────── -->
    {#if activeTab === 'crud'}
    <div class="tab-content">
      <div class="tab-header">
        <h2>CRUD операциялары жана экспорт</h2>
      </div>

      <div class="crud-layout">
        <!-- Table selector -->
        <div class="crud-selector">
          <label class="field-label">Белсене таблица</label>
          <select bind:value={crudTable} class="table-select">
            {#each crudAllTables as t}
              <option value={t.name}>{t.name} ({t.rowCount} жазуу)</option>
            {/each}
          </select>
        </div>

        {#if crudError}
          <div class="inline-error">{crudError}</div>
        {/if}

        {#if crudResult}
          <div class="crud-result-box">
            ✅ {crudResult.message || JSON.stringify(crudResult)}
          </div>
        {/if}
        

        <div class="crud-grid">
          <!-- INSERT -->
          <div class="crud-card">
            <div class="crud-card-title">
              <span class="crud-badge insert">INSERT</span>
              Жазуу кошуу
            </div>
            <div class="crud-fields">
              {#each crudColumns as col}
                <div class="field-group">
                  <label>{col}</label>
                  <input
                    bind:value={insertValues[col]}
                    placeholder="{col}..."
                    class="field-input"
                  />
                </div>
              {/each}
            </div>
            <button class="crud-btn insert-btn" onclick={crudInsert}>
              + Кошуу
            </button>
          </div>

          <!-- UPDATE -->
          <div class="crud-card">
  <div class="crud-card-title">
    <span class="crud-badge update">UPDATE</span>
    ID боюнча жазууну жаңыртуу
  </div>

  <div class="field-group">
    <label>Жазуунун ID</label>
    <input
      bind:value={updateId}
      placeholder="1"
      class="field-input"
      type="number"
    />
  </div>

  <div class="crud-fields">
    {#each crudColumns as col}
      <div class="field-group">
        <label>{col} (бош калтырсаңыз, өзгөртүлбөйт)</label>
        <input
          bind:value={updateValues[col]}
          placeholder="жаңы маани"
          class="field-input"
        />
      </div>
    {/each}
  </div>

  <button class="crud-btn update-btn" onclick={crudUpdate}>
    ✎ Жаңыртуу
  </button>
</div>

          <!-- DELETE -->
          <div class="crud-card">
            <div class="crud-card-title">
              <span class="crud-badge delete">DELETE</span>
              Шарт боюнча өчүрүү
            </div>
            <div class="field-group">
              <label for="del-cond">Шарт (КАЙДА ...)</label>
              <input id="del-cond" bind:value={deleteCondition} placeholder="id=1" class="field-input" />
            </div>
            <div class="delete-hint">
              Мисалдар: <code>id=5</code> · <code>age &lt; 18</code> · <code>city=Бишкек</code>
            </div>
            <button class="crud-btn delete-btn" onclick={crudDelete}>
              ✕ Өчүр
            </button>
          </div>

          <!-- EXPORT -->
          <div class="crud-card">
            <div class="crud-card-title">
              <span class="crud-badge export">EXPORT</span>
              Маалыматтарды экспорт кыл
            </div>
            <p class="export-desc">
              <strong>{crudTable}</strong> таблицасындагы бардык маалыматтарды файлга экспорт кыл.
            </p>
            <div class="export-buttons">
              <button class="crud-btn excel-btn" onclick={() => crudExport('EXCEL')}>
                ⬇ Excel (.xlsx)
              </button>
              <button class="crud-btn csv-btn" onclick={() => crudExport('CSV')}>
                ⬇ CSV (.csv)
              </button>
            </div>
            <div class="export-cmd-preview">
              ЭКСПОРТ {crudTable} В EXCEL
            </div>
          </div>
        </div>
      </div>
    </div>
    {/if}

  </main>

  <!-- ── FOOTER ── -->
  <footer class="footer">
    <span>NoSQL-KG · Кыргызча DSL · Lowdb · Svelte 5 · Node.js</span>
  </footer>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: 'Geologica', sans-serif;
    background: #0b0f1a;
    color: #e2e8f4;
    min-height: 100vh;
  }

  /* ── APP SHELL ── */
  .app { display: flex; flex-direction: column; min-height: 100vh; }

  /* ── HEADER ── */
  .header {
    background: linear-gradient(135deg, #0d1424 0%, #111827 100%);
    border-bottom: 1px solid #1e2d4a;
    position: sticky; top: 0; z-index: 100;
  }
  .header-inner {
    max-width: 1400px; margin: 0 auto;
    padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between;
    height: 64px;
  }
  .logo { display: flex; align-items: center; gap: 12px; }
  .logo-icon {
    font-size: 28px; color: #38bdf8;
    filter: drop-shadow(0 0 8px #38bdf855);
    line-height: 1;
  }
  .logo-main {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px; font-weight: 700;
    color: #fff; letter-spacing: 2px;
    display: block;
  }
  .logo-sub {
    font-size: 11px; color: #64748b;
    letter-spacing: 0.5px; display: block;
  }
  .nav { display: flex; gap: 4px; }
  .nav-btn {
    background: transparent; border: 1px solid transparent;
    color: #94a3b8; padding: 8px 18px; border-radius: 8px;
    font-family: 'Geologica', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;
  }
  .nav-btn:hover { background: #1e293b; color: #e2e8f4; border-color: #334155; }
  .nav-btn.active {
    background: #1e3a5f; color: #38bdf8;
    border-color: #2563eb44;
    box-shadow: 0 0 12px #38bdf822;
  }
  .nav-icon { font-size: 16px; }

  /* ── MAIN ── */
  .main { flex: 1; max-width: 1400px; margin: 0 auto; width: 100%; padding: 24px; }

  /* ── TAB CONTENT ── */
  .tab-content { display: flex; flex-direction: column; gap: 20px; }
  .tab-header {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 16px; border-bottom: 1px solid #1e2d4a;
  }
  .tab-header h2 {
    font-size: 22px; font-weight: 700; color: #f1f5f9;
    letter-spacing: -0.3px;
  }
  .hint { font-size: 12px; color: #475569; font-family: 'JetBrains Mono', monospace; }

  /* ── TAB 1: QUERIES ── */
  .queries-layout { display: grid; grid-template-columns: 260px 1fr; gap: 20px; }
  .examples-panel {
    background: #0d1424; border: 1px solid #1e2d4a; border-radius: 12px;
    padding: 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .panel-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.5px; color: #475569; margin-bottom: 8px;
    font-family: 'JetBrains Mono', monospace;
  }
  .example-btn {
    background: transparent; border: 1px solid transparent;
    color: #64748b; text-align: left; padding: 6px 8px; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    cursor: pointer; transition: all 0.15s; line-height: 1.4;
    word-break: break-all;
  }
  .example-btn:hover { background: #1e293b; color: #94a3b8; border-color: #334155; }
  .example-btn.history { color: #475569; }
  .history-time { color: #334155; display: block; font-size: 10px; margin-bottom: 2px; }

  .editor-wrap {
    background: #0d1424; border: 1px solid #1e2d4a; border-radius: 12px; overflow: hidden;
  }
  .dsl-editor {
    width: 100%; min-height: 140px; padding: 18px;
    background: transparent; border: none; outline: none;
    color: #38bdf8; font-family: 'JetBrains Mono', monospace; font-size: 15px;
    line-height: 1.6; resize: vertical;
    caret-color: #38bdf8;
  }
  .dsl-editor::placeholder { color: #334155; }
  .editor-footer {
    display: flex; gap: 10px; padding: 12px 18px;
    border-top: 1px solid #1e2d4a; background: #080d17;
  }
  .run-btn {
    background: linear-gradient(135deg, #1d4ed8, #2563eb);
    border: none; color: #fff; padding: 10px 24px; border-radius: 8px;
    font-family: 'Geologica', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;
  }
  .run-btn:hover:not(:disabled) { background: linear-gradient(135deg, #2563eb, #3b82f6); transform: translateY(-1px); }
  .run-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .clear-btn {
    background: transparent; border: 1px solid #334155; color: #64748b;
    padding: 10px 18px; border-radius: 8px; cursor: pointer;
    font-family: 'Geologica', sans-serif; font-size: 14px; transition: all 0.2s;
  }
  .clear-btn:hover { border-color: #475569; color: #94a3b8; }

  /* Results */
  .result-box {
    border-radius: 12px; padding: 18px; border: 1px solid;
  }
  .result-box.success { background: #0a1628; border-color: #1e3a5f; }
  .result-box.error { background: #1a0a0a; border-color: #7f1d1d; }
  .result-label {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; margin-bottom: 12px;
    display: flex; align-items: center; gap: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: #64748b;
  }
  .result-count {
    background: #1e3a5f; color: #38bdf8; padding: 2px 8px;
    border-radius: 99px; font-size: 11px;
  }
  .result-message { color: #22c55e; font-size: 14px; margin-bottom: 12px; }
  .error-text { color: #f87171; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .tables-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .table-card {
    background: #111827; border: 1px solid #1e2d4a; border-radius: 8px;
    padding: 12px 16px; min-width: 160px;
  }
  .table-card-name { font-weight: 700; color: #38bdf8; margin-bottom: 4px; }
  .table-card-info { font-size: 12px; color: #64748b; margin-bottom: 4px; }
  .table-card-cols { font-size: 11px; color: #475569; font-family: 'JetBrains Mono', monospace; }

  /* Result table */
  .result-table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid #1e2d4a; }
  .result-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .result-table th {
    background: #111827; color: #94a3b8; text-align: left;
    padding: 10px 14px; border-bottom: 1px solid #1e2d4a;
    font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 12px;
    white-space: nowrap;
  }
  .result-table td {
    padding: 9px 14px; border-bottom: 1px solid #0f172a;
    color: #cbd5e1; font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
  }
  .result-table tr:last-child td { border-bottom: none; }
  .result-table tr:hover td { background: #111827; }
  .empty-result { color: #475569; text-align: center; padding: 32px; font-size: 14px; }

  .json-details { margin-top: 12px; }
  .json-details summary {
    cursor: pointer; font-size: 12px; color: #475569;
    font-family: 'JetBrains Mono', monospace;
  }
  .json-pre {
    background: #080d17; border: 1px solid #1e2d4a; border-radius: 8px;
    padding: 14px; margin-top: 8px; font-size: 11px;
    color: #64748b; font-family: 'JetBrains Mono', monospace;
    overflow-x: auto; max-height: 300px; overflow-y: auto;
  }

  /* ── TAB 2: TABLES ── */
  .action-btn {
    background: linear-gradient(135deg, #065f46, #047857);
    border: none; color: #fff; padding: 9px 18px; border-radius: 8px;
    font-family: 'Geologica', sans-serif; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
  }
  .action-btn:hover { filter: brightness(1.15); }
  .create-form {
    background: #0d1424; border: 1px solid #1e3a5f; border-radius: 12px;
    padding: 18px;
  }
  .form-title { font-weight: 700; color: #38bdf8; margin-bottom: 14px; }
  .form-row { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .field-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 140px; }
  .field-group label, .field-label {
    font-size: 12px; font-weight: 600; color: #64748b;
    text-transform: uppercase; letter-spacing: 0.8px;
  }
  .field-input {
    background: #080d17; border: 1px solid #1e2d4a; color: #e2e8f4;
    padding: 9px 12px; border-radius: 8px; font-family: 'JetBrains Mono', monospace;
    font-size: 13px; outline: none; transition: border-color 0.2s;
  }
  .field-input:focus { border-color: #2563eb; }

  .tables-layout { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
  .tables-list-panel {
    background: #0d1424; border: 1px solid #1e2d4a; border-radius: 12px;
    padding: 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .table-list-item {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent; transition: all 0.15s;
  }
  .table-list-item:hover { background: #111827; border-color: #1e2d4a; }
  .table-list-item.selected { background: #1e3a5f; border-color: #2563eb44; }
  .tli-name { font-weight: 600; color: #e2e8f4; font-size: 14px; flex: 1; }
  .tli-meta { font-size: 11px; color: #475569; font-family: 'JetBrains Mono', monospace; }
  .tli-delete {
    background: transparent; border: none; color: #475569; cursor: pointer;
    font-size: 13px; padding: 2px 5px; border-radius: 4px; transition: all 0.15s;
    line-height: 1;
  }
  .tli-delete:hover { background: #7f1d1d33; color: #f87171; }
  .loading-msg { color: #475569; font-size: 13px; padding: 12px; }

  .table-content-panel {
    background: #0d1424; border: 1px solid #1e2d4a; border-radius: 12px;
    overflow: hidden;
  }
  .content-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; border-bottom: 1px solid #1e2d4a;
    background: #080d17;
  }
  .content-title { font-weight: 700; color: #38bdf8; font-size: 15px; flex: 1; }
  .content-meta { font-size: 12px; color: #475569; font-family: 'JetBrains Mono', monospace; }
  .refresh-btn {
    background: transparent; border: 1px solid #1e2d4a; color: #64748b;
    padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
    transition: all 0.15s;
  }
  .refresh-btn:hover { border-color: #475569; color: #94a3b8; }
  .no-selection {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; min-height: 200px; color: #334155; font-size: 14px;
  }
  .no-selection-icon { font-size: 48px; opacity: 0.3; }

  /* ── TAB 3: CRUD ── */
  .crud-layout { display: flex; flex-direction: column; gap: 16px; }
  .crud-selector { display: flex; flex-direction: column; gap: 8px; max-width: 320px; }
  .table-select {
    background: #0d1424; border: 1px solid #1e2d4a; color: #e2e8f4;
    padding: 10px 14px; border-radius: 8px; font-family: 'JetBrains Mono', monospace;
    font-size: 13px; outline: none; cursor: pointer; appearance: none;
  }
  .table-select:focus { border-color: #2563eb; }
  .crud-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .crud-card {
    background: #0d1424; border: 1px solid #1e2d4a; border-radius: 12px;
    padding: 18px; display: flex; flex-direction: column; gap: 12px;
  }
  .crud-card-title {
    display: flex; align-items: center; gap: 10px;
    font-weight: 700; color: #e2e8f4; font-size: 15px;
  }
  .crud-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    padding: 3px 8px; border-radius: 4px; letter-spacing: 1px;
  }
  .crud-badge.insert { background: #052e16; color: #22c55e; }
  .crud-badge.update { background: #1c1917; color: #f59e0b; }
  .crud-badge.delete { background: #1a0a0a; color: #f87171; }
  .crud-badge.export { background: #0c1a2e; color: #38bdf8; }
  .crud-fields { display: flex; flex-direction: column; gap: 8px; }
  .crud-btn {
    border: none; padding: 10px 18px; border-radius: 8px;
    font-family: 'Geologica', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; margin-top: auto;
  }
  .insert-btn { background: linear-gradient(135deg, #065f46, #047857); color: #fff; }
  .insert-btn:hover { filter: brightness(1.15); }
  .update-btn { background: linear-gradient(135deg, #92400e, #b45309); color: #fff; }
  .update-btn:hover { filter: brightness(1.15); }
  .delete-btn { background: linear-gradient(135deg, #7f1d1d, #991b1b); color: #fff; }
  .delete-btn:hover { filter: brightness(1.15); }
  .excel-btn { background: linear-gradient(135deg, #14532d, #166534); color: #fff; }
  .excel-btn:hover { filter: brightness(1.15); }
  .csv-btn { background: linear-gradient(135deg, #0c4a6e, #075985); color: #fff; margin-top: 8px; }
  .csv-btn:hover { filter: brightness(1.15); }
  .delete-hint { font-size: 12px; color: #475569; }
  .delete-hint code {
    background: #1e2d4a; padding: 1px 5px; border-radius: 4px;
    font-family: 'JetBrains Mono', monospace; color: #94a3b8;
  }
  .export-desc { font-size: 13px; color: #64748b; line-height: 1.5; }
  .export-desc strong { color: #38bdf8; }
  .export-buttons { display: flex; flex-direction: column; gap: 0; }
  .export-cmd-preview {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: #334155; background: #080d17; padding: 6px 10px; border-radius: 6px;
  }

  .inline-error {
    background: #1a0a0a; border: 1px solid #7f1d1d; color: #f87171;
    padding: 10px 14px; border-radius: 8px; font-size: 13px;
  }
  .crud-result-box {
    background: #052e16; border: 1px solid #14532d; color: #22c55e;
    padding: 10px 14px; border-radius: 8px; font-size: 13px;
  }

  /* ── FOOTER ── */
  .footer {
    border-top: 1px solid #1e2d4a; padding: 14px 24px;
    text-align: center; font-size: 12px; color: #334155;
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── SPINNER ── */
  .spinner {
    width: 14px; height: 14px; border: 2px solid #ffffff44;
    border-top-color: #fff; border-radius: 50%;
    animation: spin 0.6s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
