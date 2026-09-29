import { html, api, fmtDate, toast, DEMO_MODE } from '../lib.js?v=20260929-4';

const STATUS = { actual: ['Актуален', 'ok'], review: ['На пересмотре', 'warn'], archive: ['Архив', ''] };
const TYPE = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'Презентация', cdr: 'Макет', zip: 'Архив' };

function size(bytes) {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export async function documentsView({ query }) {
  const { folders, items } = await api('/api/documents');
  const folder = query.get('folder') || '';
  const q = (query.get('q') || '').trim();
  const shown = items
    .filter((d) => !folder || d.folder === folder)
    .filter((d) => !q || `${d.title} ${d.owner}`.toLocaleLowerCase('ru-RU').includes(q.toLocaleLowerCase('ru-RU')))
    .sort((a, b) => (a.status === 'archive') - (b.status === 'archive') || b.updated_at.localeCompare(a.updated_at));
  const link = (f) => `#/documents${f ? `?folder=${f}` : ''}`;
  const current = folders.find((f) => f.id === folder);

  return {
    title: 'Документы',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Франшизная папка · ${items.length} документов</span>
        <h1>${current ? current.title : 'Документы'}</h1>
        <p class="lead">${current ? current.description : 'Актуальные версии документов сети: у каждого есть владелец, версия и дата обновления. Устаревшее — в архиве, а не рядом с актуальным.'}</p>
      </div>
      ${DEMO_MODE ? html`<p class="notice">Раздел этапа 4. Показан пример наполнения; в демо файлы не скачиваются.</p>` : ''}

      <div class="folders">
        <a class="folder ${!folder ? 'on' : ''}" href="${link('')}"><b>Все</b><span class="small muted">${items.length}</span></a>
        ${folders.map((f) => html`<a class="folder ${f.id === folder ? 'on' : ''}" href="${link(f.id)}"><b>${f.title}</b><span class="small muted">${f.count}</span></a>`)}
      </div>

      <form class="search narrow" id="doc-search" role="search">
        <input name="q" type="search" value="${q}" placeholder="Найти документ" aria-label="Поиск документа">
      </form>

      ${shown.length ? html`<div class="table-wrap"><table>
        <thead><tr><th>Документ</th><th>Тип</th><th>Версия</th><th>Обновлён</th><th>Владелец</th><th>Статус</th><th></th></tr></thead>
        <tbody id="docs">${shown.map((d) => html`<tr>
          <td><b>${d.title}</b>${!folder ? html`<div class="small muted">${folders.find((f) => f.id === d.folder)?.title}</div>` : ''}</td>
          <td class="small">${TYPE[d.type] || d.type.toUpperCase()} · ${size(d.size)}</td>
          <td class="small">${d.version}</td>
          <td class="small">${fmtDate(d.updated_at)}</td>
          <td class="small">${d.owner}</td>
          <td><span class="pill ${STATUS[d.status][1]}">${STATUS[d.status][0]}</span></td>
          <td><button class="btn sm" type="button" data-doc="${d.title}">Открыть</button></td></tr>`)}</tbody>
      </table></div>` : html`<div class="empty">Ничего не найдено.</div>`}`,
    mount(root) {
      root.querySelector('#doc-search').addEventListener('submit', (e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        if (folder) p.set('folder', folder);
        const value = new FormData(e.target).get('q').trim();
        if (value) p.set('q', value);
        location.hash = `#/documents${p.size ? `?${p}` : ''}`;
      });
      root.querySelector('#docs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-doc]');
        if (btn) toast(DEMO_MODE ? 'В демо-версии файлы не выдаются' : 'Выдача файлов — этап 4');
      });
    },
  };
}
