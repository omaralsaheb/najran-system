// ============ المهام + لوحة الموظف + التقويم ============
import {
  state, esc, PRIO_LABEL, STATUS_LABEL, TASK_STATUSES, TYPE_LABEL,
  employeeName, clientName, can,
} from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast, renderNotifPanel, go } from '../ui.js';
import { getLocale } from '../i18n.js';
import * as store from '../store.js';

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString(getLocale());
}

// بيحوّل ISO لصيغة خانة datetime-local (بالتوقيت المحلي، مش UTC)
function toDatetimeLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validDriveLink(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(host)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

const activityLabel = (action) => ({
  created: 'تم إنشاء المهمة', updated: 'تم تعديل المهمة', status_changed: 'تم تغيير الحالة',
  completed: 'تم إنهاء وتسليم المهمة', deleted: 'تم حذف المهمة',
}[action] || action);

const activityDetail = (detail) => STATUS_LABEL[detail]
  || ({ whatsapp: 'واتساب', drive: 'Google Drive' }[detail]) || detail || '';

let taskReturnPage = 'tasks';

async function ensureRefs() {
  if (state.roles.length === 0) await store.loadRoles().catch(() => {});
  if (state.employees.length === 0) await store.loadEmployees().catch(() => {});
  if (state.clients.length === 0) await store.loadClients().catch(() => {});
}

/* ---------- صفحة المهام ---------- */

export async function showTasks() {
  loading('عم نجيب المهام...');
  try {
    await store.loadTasks();
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل المهام', store.humanError(err));
    return;
  }
  renderTasks();
}

function renderTasks() {
  let all = state.tasks;
  if (state.taskFilterEmp !== 'all') all = all.filter((t) => t.assigneeId === state.taskFilterEmp);

  const boardHTML = `
    <div class="board-cols">
      ${TASK_STATUSES.map((st) => {
        const col = all.filter((t) => t.status === st);
        return `
        <div class="board-col">
          <h4>${STATUS_LABEL[st]} (${col.length})</h4>
          ${col.map((t) => `
            <div class="board-card task-open-card" data-action="view-task" data-id="${esc(t.id)}" role="button" tabindex="0">
              <div class="t-title">${esc(t.title)}</div>
              <div class="t-meta">${esc(clientName(t.clientId)) || 'بدون عميل'} · ${esc(employeeName(t.assigneeId))}<br>${fmtDate(t.deadline)}</div>
              ${t.notes ? `<div class="t-notes">📝 ${esc(t.notes)}</div>` : ''}
              <div class="task-card-actions"><button class="icon-btn" data-action="view-task" data-id="${esc(t.id)}">التفاصيل</button><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></div>
            </div>
          `).join('') || '<div class="task-empty">فاضي</div>'}
        </div>`;
      }).join('')}
    </div>
  `;

  const listHTML = all.length === 0
    ? '<div class="empty-state"><div class="empty-title">ما في مهام</div></div>'
    : `
    <div class="table-scroll"><table class="content-table">
      <thead><tr><th>المهمة</th><th>العميل</th><th>الموظف المسؤول</th><th>الأولوية</th><th>الموعد</th><th>الحالة</th><th>ملاحظات</th><th></th></tr></thead>
      <tbody>${all.map((t) => `<tr class="task-open-row" data-action="view-task" data-id="${esc(t.id)}">
        <td>${esc(t.title)}</td>
        <td>${esc(clientName(t.clientId)) || '—'}</td>
        <td>${esc(employeeName(t.assigneeId))}</td>
        <td><span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span></td>
        <td class="mono" style="font-size:12px">${fmtDate(t.deadline)}</td>
        <td>${STATUS_LABEL[t.status] || ''}</td>
        <td style="font-size:12px; color:var(--text-dim)">${esc(t.notes) || '—'}</td>
        <td><span class="table-task-actions"><button class="icon-btn" data-action="view-task" data-id="${esc(t.id)}">التفاصيل</button><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></span></td>
      </tr>`).join('')}</tbody>
    </table></div>
  `;

  render(`
    <div class="topbar">
      <div><div class="page-title">المهام</div><div class="page-sub">كل مهام الوكالة عبر الفريق والعملاء — محفوظة على Firebase</div></div>
      <button class="btn" data-action="add-task">+ إضافة مهمة</button>
    </div>
    <div class="toolbar">
      <select class="filter-select" data-action="filter-task-emp">
        <option value="all">كل الموظفين</option>
        ${state.employees.map((e) => `<option value="${esc(e.id)}" ${state.taskFilterEmp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="view-toggle">
      <button class="${state.taskView === 'board' ? 'active' : ''}" data-action="set-task-view" data-view="board">Board</button>
      <button class="${state.taskView === 'list' ? 'active' : ''}" data-action="set-task-view" data-view="list">List</button>
    </div>
    ${state.taskView === 'board' ? boardHTML : listHTML}
  `);
}

/* ---------- مودال المهمة (إضافة/تعديل بنفس الفورم) ---------- */

async function openTaskModal(taskId) {
  await ensureRefs();
  const t = taskId ? state.tasks.find((x) => x.id === taskId) : null;
  if (taskId && !t) { toast('المهمة مو موجودة', true); return; }

  const v = t || {
    title: '', clientId: '', assigneeId: state.currentUser.id,
    priority: 'mid', status: 'today', deadline: '', notes: '',
  };

  openModal(`
    <h3>${t ? 'تعديل المهمة' : 'إضافة مهمة جديدة'}</h3>
    <div class="field">
      <label>اسم المهمة *</label>
      <input id="t-title" value="${esc(v.title)}" placeholder="مثال: تصميم بوست عرض العيد">
      <div class="err" id="err-t-title"></div>
    </div>
    <div class="field">
      <label>العميل</label>
      <select id="t-client">
        <option value="">— بدون عميل محدد —</option>
        ${state.clients.map((c) => `<option value="${esc(c.id)}" ${v.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>الموظف المسؤول *</label>
      <select id="t-assignee">
        ${state.employees.map((e) => `<option value="${esc(e.id)}" ${v.assigneeId === e.id ? 'selected' : ''}>${esc(e.name)} — ${esc(e.roleLabel)}</option>`).join('')}
      </select>
      <div class="err" id="err-t-assignee"></div>
    </div>
    <div class="field">
      <label>الأولوية</label>
      <select id="t-priority">
        <option value="high" ${v.priority === 'high' ? 'selected' : ''}>عالية</option>
        <option value="mid" ${v.priority === 'mid' ? 'selected' : ''}>متوسطة</option>
        <option value="low" ${v.priority === 'low' ? 'selected' : ''}>منخفضة</option>
      </select>
    </div>
    <div class="field">
      <label>الموعد النهائي *</label>
      <input id="t-deadline" type="datetime-local" value="${v.deadline ? toDatetimeLocal(v.deadline) : ''}">
      <div class="err" id="err-t-deadline"></div>
    </div>
    <div class="field">
      <label>الحالة${t ? ' — تقدر تعدّلها حتى لو "مكتمل"' : ' الابتدائية'}</label>
      <select id="t-status">
        ${TASK_STATUSES.filter((st) => st !== 'done' || v.status === 'done').map((st) => `<option value="${st}" ${v.status === st ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>ملاحظات</label>
      <input id="t-notes" value="${esc(v.notes)}" placeholder="أي تفاصيل إضافية عن المهمة">
    </div>
    <div class="err" id="err-t-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="submit-task" data-id="${esc(taskId || '')}">${t ? 'حفظ' : 'إضافة'}</button>
    </div>
  `);
}

async function submitTask(btn) {
  const taskId = btn.dataset.id;
  const title = document.getElementById('t-title').value.trim();
  const assigneeId = document.getElementById('t-assignee').value;
  const deadlineRaw = document.getElementById('t-deadline').value;

  let ok = true;
  ok = setErr('err-t-title', !title && 'لازم تدخل اسم المهمة') && ok;
  ok = setErr('err-t-assignee', !assigneeId && 'لازم تختار موظف مسؤول') && ok;
  ok = setErr('err-t-deadline', !deadlineRaw && 'لازم تدخل الموعد') && ok;
  if (!ok) return;

  const data = {
    title,
    clientId: document.getElementById('t-client').value || null,
    assigneeId,
    priority: document.getElementById('t-priority').value,
    status: document.getElementById('t-status').value,
    deadline: new Date(deadlineRaw).toISOString(),
    notes: document.getElementById('t-notes').value.trim(),
  };

  btn.disabled = true;
  try {
    if (taskId) await store.updateTask(taskId, data);
    else await store.createTask(data);
    closeModal();
    toast(taskId ? 'انحفظت المهمة' : 'تمت إضافة المهمة');
    renderNotifPanel();
    if (state.currentPage === 'my-dashboard') showMyDashboard();
    else renderTasks();
  } catch (err) {
    setErr('err-t-submit', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- صفحة تفاصيل المهمة وإجراءاتها ---------- */

export function renderTaskDetailsView(t, activity = []) {
  const isAssignee = t.assigneeId === state.currentUser.id;
  const canAct = isAssignee || can('overview') || can('settings');
  const canDelete = can('settings') && state.currentUser.isAccessAccount !== true;
  const driveLink = validDriveLink(t.deliveryLink);
  const isDone = t.status === 'done';
  const statusActions = !canAct || isDone ? '' : `
    <div class="task-workflow-actions">
      ${t.status !== 'progress' ? `<button class="task-action start" data-action="task-status" data-id="${esc(t.id)}" data-status="progress"><i class="fi fi-rr-play"></i><span>بدء المهمة</span></button>` : ''}
      ${t.status === 'progress' ? `<button class="task-action pause" data-action="task-status" data-id="${esc(t.id)}" data-status="paused"><i class="fi fi-rr-pause"></i><span>إيقاف مؤقت</span></button>` : ''}
      <button class="task-action complete" data-action="open-task-complete" data-id="${esc(t.id)}"><i class="fi fi-rr-check-circle"></i><span>إنهاء المهمة</span></button>
    </div>`;

  const delivery = isDone ? `
    <article class="task-delivery-card ${esc(t.deliveryMethod || '')}">
      <span class="task-detail-icon"><i class="fi ${t.deliveryMethod === 'drive' ? 'fi-rr-folder-open' : 'fi-rr-comment-alt'}"></i></span>
      <div><small>طريقة التسليم</small><strong>${t.deliveryMethod === 'drive' ? 'Google Drive' : 'واتساب'}</strong>
      ${driveLink ? `<a href="${esc(driveLink)}" target="_blank" rel="noopener">فتح رابط Drive <i class="fi fi-rr-arrow-up-right-from-square"></i></a>` : ''}</div>
    </article>` : '';

  render(`
    <section class="task-detail-page">
      <button class="profile-back" data-action="task-back"><i class="fi fi-rr-arrow-right"></i> رجوع إلى المهام</button>
      <header class="task-detail-hero">
        <div class="task-detail-title">
          <span class="section-kicker">تفاصيل المهمة</span>
          <h1>${esc(t.title)}</h1>
          <p>${esc(clientName(t.clientId) || 'بدون عميل')} · ${esc(employeeName(t.assigneeId))}</p>
        </div>
        <div class="task-detail-badges"><span class="task-state ${esc(t.status)}">${esc(STATUS_LABEL[t.status] || t.status)}</span><span class="prio ${esc(t.priority)}">${esc(PRIO_LABEL[t.priority] || '')}</span></div>
      </header>

      <div class="task-detail-layout">
        <div class="task-detail-main">
          <div class="task-info-grid">
            <article><span class="task-detail-icon"><i class="fi fi-rr-user"></i></span><div><small>الموظف المسؤول</small><strong>${esc(employeeName(t.assigneeId))}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-calendar-clock"></i></span><div><small>الموعد النهائي</small><strong>${fmtDate(t.deadline)}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-building"></i></span><div><small>العميل</small><strong>${esc(clientName(t.clientId) || 'بدون عميل')}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-signal-alt-2"></i></span><div><small>الأولوية</small><strong>${esc(PRIO_LABEL[t.priority] || '—')}</strong></div></article>
          </div>
          <article class="task-notes-card"><div class="section-head compact"><div><span class="section-kicker">وصف العمل</span><h2>ملاحظات المهمة</h2></div></div><p>${esc(t.notes || 'بدون ملاحظات')}</p></article>
          ${delivery}
          <article class="task-history-card">
            <div class="section-head compact"><div><span class="section-kicker">سجل المهمة</span><h2>آخر الإجراءات</h2></div></div>
            <div class="task-history-list">${activity.length ? activity.slice(0, 10).map((item) => `<div class="task-history-row"><span><i class="fi fi-rr-time-past"></i></span><div><strong>${esc(activityLabel(item.action))}${activityDetail(item.detail) ? ` · ${esc(activityDetail(item.detail))}` : ''}</strong><small>${esc(employeeName(item.employeeId))} · ${fmtDate(item.createdAt)}</small></div></div>`).join('') : '<div class="task-empty">لا توجد إجراءات مسجلة بعد</div>'}</div>
          </article>
        </div>

        <aside class="task-detail-side">
          <article class="task-action-panel">
            <span class="section-kicker">إجراء المهمة</span>
            <h2>${isDone ? 'تم إنجاز المهمة' : 'ماذا تريد أن تفعل؟'}</h2>
            <p>${isDone ? 'تم حفظ طريقة التسليم وتاريخ الإنجاز.' : 'حدّث حالة المهمة ليعرف الفريق أين وصل العمل.'}</p>
            ${statusActions || (isDone ? `<div class="task-finished-mark"><i class="fi fi-rr-check"></i><span>مكتملة</span></div>` : '<div class="task-empty compact">الإجراءات متاحة للموظف المسؤول والإدارة.</div>')}
          </article>
          <article class="task-manage-panel">
            <button class="btn ghost" data-action="edit-task" data-id="${esc(t.id)}"><i class="fi fi-rr-pencil"></i> تعديل المهمة</button>
            ${canDelete ? `<button class="btn danger-outline" data-action="request-delete-task" data-id="${esc(t.id)}"><i class="fi fi-rr-trash"></i> حذف المهمة</button>` : ''}
          </article>
        </aside>
      </div>
    </section>
  `);
}

async function showTaskDetails(taskId) {
  if (state.currentPage !== 'tasks') taskReturnPage = state.currentPage;
  else if (!document.querySelector('.task-detail-page')) taskReturnPage = 'tasks';
  if (state.currentPage === 'home') store.stopPresenceListener();
  loading('جاري تحميل تفاصيل المهمة...');
  try {
    if (!state.tasks.some((task) => task.id === taskId)) await store.loadTasks();
    await ensureRefs();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) { errorState('المهمة غير موجودة', 'ربما تم حذفها أو لم تعد متاحة.'); return; }
    const activity = await store.loadTaskActivity(taskId).catch(() => []);
    state.currentPage = 'tasks';
    document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === 'tasks'));
    renderTaskDetailsView(task, activity);
  } catch (err) {
    errorState('تعذر تحميل تفاصيل المهمة', store.humanError(err));
  }
}

function backFromTaskDetails() {
  const target = state.currentUser.permissions.includes(taskReturnPage) ? taskReturnPage : 'tasks';
  go(target);
}

async function changeTaskStatus(btn) {
  btn.disabled = true;
  try {
    await store.setTaskStatus(btn.dataset.id, btn.dataset.status);
    toast(btn.dataset.status === 'paused' ? 'تم إيقاف المهمة مؤقتاً' : 'بدأ تنفيذ المهمة');
    renderNotifPanel();
    await showTaskDetails(btn.dataset.id);
  } catch (err) {
    toast(store.humanError(err), true);
  } finally {
    btn.disabled = false;
  }
}

function openTaskCompletion(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) { toast('المهمة غير موجودة', true); return; }
  openModal(`
    <div class="modal-title-icon"><i class="fi fi-rr-paper-plane"></i></div>
    <h3>إنهاء المهمة وتسليمها</h3>
    <p class="modal-hint">اختر كيف تم تسليم العمل. عند اختيار Drive يجب إضافة رابط الملف.</p>
    <div class="field"><label>طريقة التسليم *</label><select id="task-delivery-method" data-action="toggle-task-delivery"><option value="">اختر طريقة التسليم</option><option value="whatsapp">واتساب</option><option value="drive">Google Drive</option></select><div class="err" id="err-task-delivery"></div></div>
    <div class="field task-drive-field" id="task-drive-field" hidden><label>رابط Google Drive *</label><input id="task-drive-link" type="url" dir="ltr" placeholder="https://drive.google.com/..."><small>يمكن استخدام رابط Drive أو Google Docs.</small><div class="err" id="err-task-drive"></div></div>
    <div class="err" id="err-task-complete"></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="confirm-task-complete" data-id="${esc(taskId)}">إنهاء وتسليم</button></div>
  `);
}

function toggleTaskDelivery(select) {
  const field = document.getElementById('task-drive-field');
  if (field) field.hidden = select.value !== 'drive';
}

async function submitTaskCompletion(btn) {
  const method = document.getElementById('task-delivery-method')?.value || '';
  const rawLink = document.getElementById('task-drive-link')?.value || '';
  const link = method === 'drive' ? validDriveLink(rawLink) : '';
  let ok = true;
  ok = setErr('err-task-delivery', !method && 'اختر طريقة التسليم') && ok;
  ok = setErr('err-task-drive', method === 'drive' && !link && 'أدخل رابط Google Drive صحيحاً يبدأ بـ https://') && ok;
  if (!ok) return;
  btn.disabled = true;
  try {
    await store.completeTask(btn.dataset.id, method, link);
    closeModal();
    toast('تم إنهاء المهمة وحفظ طريقة التسليم');
    renderNotifPanel();
    await showTaskDetails(btn.dataset.id);
  } catch (err) {
    setErr('err-task-complete', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

function requestDeleteTask(taskId) {
  if (!can('settings') || state.currentUser.isAccessAccount === true) { toast('حذف المهمة متاح للإدارة فقط', true); return; }
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) { toast('المهمة غير موجودة', true); return; }
  openModal(`<div class="modal-title-icon danger"><i class="fi fi-rr-trash"></i></div><h3>حذف المهمة</h3><p class="modal-hint">سيتم حذف مهمة «${esc(task.title)}» نهائياً، مع الاحتفاظ بسجل الإجراءات الإداري.</p><div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn danger" data-action="confirm-delete-task" data-id="${esc(taskId)}">تأكيد الحذف</button></div>`);
}

async function confirmDeleteTask(btn) {
  btn.disabled = true;
  try {
    await store.deleteTask(btn.dataset.id);
    closeModal();
    toast('تم حذف المهمة');
    renderNotifPanel();
    const target = state.currentUser.permissions.includes(taskReturnPage) ? taskReturnPage : 'tasks';
    go(target);
  } catch (err) {
    toast(store.humanError(err), true);
    btn.disabled = false;
  }
}

/* ---------- لوحة الموظف ---------- */

export async function showMyDashboard() {
  loading('عم نجيب مهامك...');
  try {
    await store.loadTasks();
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل مهامك', store.humanError(err));
    return;
  }

  const mine = state.tasks.filter((t) => t.assigneeId === state.currentUser.id);
  const byStatus = (st) => mine.filter((t) => t.status === st);
  const today = byStatus('today');
  const progress = byStatus('progress');
  const paused = byStatus('paused');
  const review = byStatus('review');
  const revision = byStatus('revision');
  const isToday = (t) => {
    const d = new Date(t.updatedAt || 0);
    return d.toDateString() === new Date().toDateString();
  };
  const doneToday = mine.filter((t) => t.status === 'done' && isToday(t));

  const col = (title, list, showCheck) => `
    <div class="task-col">
      <h4>${title} <b>${list.length}</b></h4>
      ${list.length === 0 ? '<div class="task-empty">ولا مهمة</div>' : list.map((t) => `
        <div class="task-item task-open-card" data-action="view-task" data-id="${esc(t.id)}" role="button" tabindex="0">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-meta">
            <span>${esc(clientName(t.clientId)) || 'بدون عميل'} · ${fmtDate(t.deadline)}</span>
            <span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span>
          </div>
          ${t.notes ? `<div class="t-notes">📝 ${esc(t.notes)}</div>` : ''}
          <div style="margin-top:8px; display:flex; justify-content:space-between;">
            <button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button>
            ${showCheck ? `<button class="done-check" data-action="mark-done" data-id="${esc(t.id)}">✓ إنجاز</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  render(`
    <div class="topbar">
      <div>
        <div class="page-title">أهلاً ${esc((state.currentUser.name || '').split(' ')[0])} 👋</div>
        <div class="page-sub">${esc(state.currentUser.role)} — هاد ملخص شغلك اليوم</div>
      </div>
      <button class="btn" data-action="add-task">+ إضافة مهمة</button>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">مهام اليوم</div><div class="kpi-value mono">${today.length}</div><div class="kpi-delta">لسا ما بلشت فيها</div></div>
      <div class="kpi"><div class="kpi-label">قيد التنفيذ</div><div class="kpi-value mono">${progress.length}</div><div class="kpi-delta">شغال عليها هلق</div></div>
      <div class="kpi"><div class="kpi-label">بانتظار مراجعة/تعديل</div><div class="kpi-value mono">${review.length + revision.length}</div><div class="kpi-delta">مو بإيدك هلق</div></div>
      <div class="kpi"><div class="kpi-label">أنجزتها اليوم</div><div class="kpi-value mono" style="color:var(--ok)">${doneToday.length}</div><div class="kpi-delta">👏 مبروك</div></div>
    </div>

    <div class="task-cols">
      ${col('مهام اليوم', today, true)}
      ${col('قيد التنفيذ', progress, true)}
      ${col('متوقفة مؤقتاً', paused, true)}
      ${col('بانتظار المراجعة', review, false)}
      ${col('تعديلات مطلوبة', revision, true)}
    </div>

    <div class="report-card">
      <h4>أنجزتها اليوم (${doneToday.length})</h4>
      ${doneToday.length === 0 ? '<div class="task-empty">لسا ما خلصت شي اليوم</div>' : doneToday.map((t) => `
        <div class="rank-row best task-open-row" data-action="view-task" data-id="${esc(t.id)}">
          <span class="rank-title">${esc(t.title)} <span style="color:var(--text-dim); font-size:11px;">— ${esc(clientName(t.clientId))}</span></span>
          <span style="display:flex; align-items:center; gap:10px;">
            <button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button>
            <span class="rank-value" style="color:var(--ok)">✓</span>
          </span>
        </div>
      `).join('')}
    </div>

    <div class="disclaimer"><b>ملاحظة:</b> كل مهمة هون محفوظة على Firebase ومرئية للفريق كله ولمديرك — ما بتضيع لما تسكر الصفحة.</div>
  `);
}

/* ---------- التقويم ---------- */

export async function showCalendarPage() {
  loading('عم نجيب التقويم...');
  try {
    await Promise.all([store.loadTasks(), store.loadClients(), store.loadAllContent()]);
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل التقويم', store.humanError(err));
    return;
  }

  const isManager = can('tasks') && can('overview');
  const entries = [];

  Object.entries(state.content).forEach(([cid, items]) => {
    items.forEach((it) => entries.push({
      date: it.date,
      label: `${TYPE_LABEL[it.type] || it.type}: ${it.title}`,
      meta: clientName(cid),
    }));
  });

  const relevant = isManager ? state.tasks : state.tasks.filter((t) => t.assigneeId === state.currentUser.id);
  relevant.forEach((t) => entries.push({
    date: new Date(t.deadline).toLocaleDateString(getLocale()),
    label: `مهمة: ${t.title}`,
    meta: isManager ? `${clientName(t.clientId)} · ${employeeName(t.assigneeId)}` : clientName(t.clientId),
  }));

  const groups = {};
  entries.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
  const dates = Object.keys(groups);

  render(`
    <div class="topbar"><div>
      <div class="page-title">${isManager ? 'التقويم' : 'تقويمي'}</div>
      <div class="page-sub">${isManager ? 'كل مواعيد المحتوى والمهام عبر العملاء' : 'مواعيدك ومهامك القادمة'}</div>
    </div></div>
    ${dates.length === 0 ? '<div class="empty-state"><div class="empty-title">ما في مواعيد مسجلة بعد</div></div>' : dates.map((d) => `
      <div class="cal-group">
        <div class="cal-date">${esc(d)}</div>
        ${groups[d].map((e) => `<div class="cal-row"><span>${esc(e.label)}</span><span class="cal-meta">${esc(e.meta)}</span></div>`).join('')}
      </div>
    `).join('')}
  `);
}

/* ---------- الأفعال ---------- */

export const actions = {
  'add-task': () => openTaskModal(null),
  'edit-task': (el) => openTaskModal(el.dataset.id),
  'submit-task': (el) => submitTask(el),
  'view-task': (el) => showTaskDetails(el.dataset.id),
  'task-back': () => backFromTaskDetails(),
  'task-status': (el) => changeTaskStatus(el),
  'open-task-complete': (el) => openTaskCompletion(el.dataset.id),
  'mark-done': (el) => openTaskCompletion(el.dataset.id),
  'toggle-task-delivery': (el) => toggleTaskDelivery(el),
  'confirm-task-complete': (el) => submitTaskCompletion(el),
  'request-delete-task': (el) => requestDeleteTask(el.dataset.id),
  'confirm-delete-task': (el) => confirmDeleteTask(el),
  'set-task-view': (el) => { state.taskView = el.dataset.view; renderTasks(); },
  'filter-task-emp': (el) => { state.taskFilterEmp = el.value; renderTasks(); },
};
