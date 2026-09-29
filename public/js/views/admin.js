import { html, api, fmtDate, ROLE_LABELS } from '../lib.js';

export async function adminView({ me }) {
  if (!me.isStaff) return { title: 'Нет доступа', body: html`<div class="empty">Раздел доступен франшизному отделу.</div>` };
  const { users } = await api('/api/admin/users');
  const audit = me.user.role === 'superadmin' ? (await api('/api/admin/audit')).entries : null;

  return {
    title: 'Администрирование',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Управление</span>
        <h1>Администрирование</h1>
        <p class="lead">Пользователи создаются только здесь (форма — этап 1). Один человек — один вход; доступ к офису задаётся привязкой, а не общим паролем.</p>
      </div>
      <section class="card">
        <h2>Пользователи</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Офисы</th><th>Последний вход</th></tr></thead>
          <tbody>${users.map((u) => html`<tr>
            <td>${u.display_name}${u.is_active ? '' : html` <span class="pill">отключён</span>`}</td><td>${u.login}</td>
            <td>${ROLE_LABELS[u.role]}</td><td>${u.offices || '—'}</td><td class="small">${u.last_login_at ? fmtDate(u.last_login_at, { time: true }) : 'не входил'}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>
      ${audit ? html`<section class="card">
        <h2>Журнал аудита</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Изменение</th></tr></thead>
          <tbody>${audit.map((e) => html`<tr>
            <td class="small">${fmtDate(e.at, { time: true })}</td><td>${e.user || '—'}</td><td><code>${e.action}</code></td>
            <td class="small">${e.entity ? `${e.entity} #${e.entity_id}` : '—'}</td>
            <td class="small muted">${e.old_value || e.new_value ? `${e.old_value ?? '∅'} → ${e.new_value ?? '∅'}` : ''}</td>
          </tr>`)}</tbody>
        </table></div>
      </section>` : ''}`,
  };
}
