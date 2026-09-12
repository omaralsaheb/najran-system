// ============ العملاء + المحتوى + البريف + التقارير ============
import { state, esc, TYPE_LABEL, PRIO_LABEL, STATUS_LABEL, employeeName, can } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import { getLocale, getDateLocale } from '../i18n.js';
import * as store from '../store.js';

const clientContent = (id) => state.content[id] || [];
const totalViews = (id) => clientContent(id).reduce((s, i) => s + (Number(i.views) || 0), 0);
const clientTasks = (id) => state.tasks.filter((t) => t.clientId === id);
const PLATFORM_LABEL = { instagram: 'انستغرام', facebook: 'فيسبوك' };
const platformKey = (value) => value === 'facebook' ? 'facebook' : 'instagram';
const platformLabel = (value) => PLATFORM_LABEL[platformKey(value)];

// أسماء الشهور بالصيغتين الشامية والخليجية — المحتوى القديم كان ينكتب بالاسم
const MONTH_NAMES = {
  'كانون الثاني': 1, 'يناير': 1, 'شباط': 2, 'فبراير': 2, 'آذار': 3, 'اذار': 3, 'مارس': 3,
  'نيسان': 4, 'أبريل': 4, 'ابريل': 4, 'أيار': 5, 'ايار': 5, 'مايو': 5,
  'حزيران': 6, 'يونيو': 6, 'تموز': 7, 'يوليو': 7, 'آب': 8, 'اب': 8, 'أغسطس': 8, 'اغسطس': 8,
  'أيلول': 9, 'ايلول': 9, 'سبتمبر': 9, 'تشرين الأول': 10, 'تشرين الاول': 10, 'أكتوبر': 10, 'اكتوبر': 10,
  'تشرين الثاني': 11, 'نوفمبر': 11, 'كانون الأول': 12, 'كانون الاول': 12, 'ديسمبر': 12,
};

const pad2 = (n) => String(n).padStart(2, '0');
const asKey = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

// بيحوّل أي صيغة تاريخ لمفتاح YYYY-MM-DD.
// مهم: المحتوى القديم محفوظ كنص حر ("20/6"، "15 آب") لأن الحقل كان نصّي قبل ما
// يصير حقل تاريخ. بدون تفسير هالصيغ، أي فلترة بتصفّي كل السجلات القديمة.
// fallbackTs = وقت إنشاء السجل، منستعمله نجيب السنة لما التاريخ بلا سنة.
function contentDateKey(value, fallbackTs) {
  if (!value && value !== 0) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  // أصلاً بالصيغة الصحيحة
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return asKey(iso[1], Number(iso[2]), Number(iso[3]));

  const fallbackYear = (() => {
    const ts = Number(fallbackTs);
    if (Number.isFinite(ts) && ts > 0) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) return d.getFullYear();
    }
    return new Date().getFullYear();
  })();

  // يوم/شهر أو يوم/شهر/سنة
  const slash = raw.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = slash[3] ? Number(slash[3]) : fallbackYear;
      if (year < 100) year += 2000;
      return asKey(year, month, day);
    }
  }

  // "15 آب" أو "15 آب 2026"
  const named = raw.match(/^(\d{1,2})\s+(.+?)(?:\s+(\d{4}))?$/);
  if (named) {
    const day = Number(named[1]);
    const month = MONTH_NAMES[named[2].trim()];
    if (month && day >= 1 && day <= 31) {
      return asKey(named[3] ? Number(named[3]) : fallbackYear, month, day);
    }
  }

  // آخر محاولة: تفسير المتصفح
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return asKey(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return '';
}

function formatContentDate(value, fallbackTs) {
  const key = contentDateKey(value, fallbackTs);
  if (!key) return String(value || '—');
  return new Date(`${key}T12:00:00`).toLocaleDateString(getDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function filteredClientContent(id) {
  return clientContent(id).filter((item) => {
    const platform = platformKey(item.platform);
    if (state.contentPlatformFilter !== 'all' && platform !== state.contentPlatformFilter) return false;
    if (!state.contentDateFrom && !state.contentDateTo) return true;
    const key = contentDateKey(item.date, item.createdAt);
    if (!key) return false;
    if (state.contentDateFrom && key < state.contentDateFrom) return false;
    if (state.contentDateTo && key > state.contentDateTo) return false;
    return true;
  });
}

function contentFilterLabel() {
  const parts = [];
  if (state.contentPlatformFilter !== 'all') parts.push(PLATFORM_LABEL[state.contentPlatformFilter] || state.contentPlatformFilter);
  if (state.contentDateFrom) parts.push(`من ${formatContentDate(state.contentDateFrom)}`);
  if (state.contentDateTo) parts.push(`إلى ${formatContentDate(state.contentDateTo)}`);
  return parts.join(' · ') || 'كل الفترات والمنصات';
}

function itemsTotal(items, field) {
  return items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
}

/* ---------- نظرة عامة ---------- */

export async function showOverview() {
  state.activeClient = null;
  loading('عم نجيب العملاء...');
  try {
    await Promise.all([store.loadClients(), store.loadAllContent(), store.loadTasks()]);
  } catch (err) {
    errorState('تعذر تحميل العملاء', store.humanError(err));
    return;
  }
  renderOverview();
}

// الرسم لحاله — منستدعيه مباشرة بالبحث والفلترة بدون ما نرجع نحمّل من Firebase
export function renderOverview() {
  if (state.clients.length === 0) {
    render(`
      <div class="topbar">
        <div><div class="page-title">نظرة عامة</div><div class="page-sub">لسا ما في عملاء مضافين</div></div>
        <button class="btn" data-action="add-client">+ إضافة عميل</button>
      </div>
      <div class="empty-state">
        <img class="logo logo-img" alt="Najran Agency">
        <div class="empty-title">ابدأ بإضافة أول عميل</div>
        <div class="empty-sub">ضيف اسم الشركة والمجال، وبعدين رح تقدر تسجل محتواها وإحصائياتها أول بأول</div>
        <div class="empty-actions"><button class="btn" data-action="add-client">+ إضافة عميل</button></div>
      </div>
    `);
    return;
  }

  const industries = [...new Set(state.clients.map((c) => c.industry).filter(Boolean))];
  const filtered = state.clients.filter((c) => {
    const s = (c.name || '').toLowerCase().includes(state.searchQuery.toLowerCase());
    const i = state.filterIndustry === 'all' || c.industry === state.filterIndustry;
    const a = state.clientStatusFilter === 'all'
      || (state.clientStatusFilter === 'active' && c.active !== false)
      || (state.clientStatusFilter === 'inactive' && c.active === false);
    return s && i && a;
  });
  const totalContent = state.clients.reduce((s, c) => s + clientContent(c.id).length, 0);
  const activeClients = state.clients.filter((c) => c.active !== false).length;
  const canManageClients = can('overview') && state.currentUser.isAccessAccount !== true;

  render(`
    <div class="topbar">
      <div><div class="page-title">نظرة عامة</div><div class="page-sub">${state.clients.length} عملاء</div></div>
      <button class="btn" data-action="add-client">+ إضافة عميل</button>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">عدد العملاء</div><div class="kpi-value mono">${state.clients.length}</div><div class="kpi-delta">مسجلين بالنظام</div></div>
      <div class="kpi"><div class="kpi-label">عملاء نشطون</div><div class="kpi-value mono" style="color:var(--ok)">${activeClients}</div><div class="kpi-delta">مشاريع قيد العمل</div></div>
      <div class="kpi"><div class="kpi-label">عملاء غير نشطين</div><div class="kpi-value mono" style="color:var(--text-dim)">${state.clients.length - activeClients}</div><div class="kpi-delta">مشاريع متوقفة</div></div>
      <div class="kpi"><div class="kpi-label">محتوى مسجل</div><div class="kpi-value mono">${totalContent}</div><div class="kpi-delta">ريلز، بوست، ستوري</div></div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="client-search" placeholder="ابحث باسم العميل..." value="${esc(state.searchQuery)}" data-action="search-clients">
      <select class="filter-select" data-action="filter-industry">
        <option value="all" ${state.filterIndustry === 'all' ? 'selected' : ''}>كل المجالات</option>
        ${industries.map((i) => `<option value="${esc(i)}" ${state.filterIndustry === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}
      </select>
      <select class="filter-select" data-action="filter-client-status">
        <option value="all" ${state.clientStatusFilter === 'all' ? 'selected' : ''}>كل الحالات</option>
        <option value="active" ${state.clientStatusFilter === 'active' ? 'selected' : ''}>نشط</option>
        <option value="inactive" ${state.clientStatusFilter === 'inactive' ? 'selected' : ''}>غير نشط</option>
      </select>
    </div>
    ${filtered.length === 0 ? `<div class="empty-state"><div class="empty-title">ما في نتائج مطابقة</div><div class="empty-sub">جرب كلمة بحث تانية أو غيّر الفلتر</div></div>` : `
      <div class="clients-grid">
        ${filtered.map((c) => `
          <div class="client-card ${c.active === false ? 'inactive' : ''}" data-action="open-client" data-id="${esc(c.id)}">
            <div class="client-top">
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="avatar">${esc((c.name || '؟')[0])}</div>
                <div><div class="client-name">${esc(c.name)}</div><div class="client-industry">${esc(c.industry)}</div></div>
              </div>
              <div class="client-card-badges"><span class="badge">${clientContent(c.id).length} محتوى</span>${canManageClients ? `<button class="client-status-chip ${c.active === false ? 'inactive' : 'active'}" data-action="toggle-client-active" data-id="${esc(c.id)}" data-active="${c.active !== false}"><i class="fi ${c.active === false ? 'fi-rr-pause' : 'fi-rr-check'}"></i>${c.active === false ? 'غير نشط' : 'نشط'}</button>` : `<span class="client-status-chip ${c.active === false ? 'inactive' : 'active'}">${c.active === false ? 'غير نشط' : 'نشط'}</span>`}</div>
            </div>
            <div class="client-stats">
              <div><div class="cstat-v">${totalViews(c.id).toLocaleString()}</div><div class="cstat-l">مشاهدات إجمالي</div></div>
              <div><div class="cstat-v">${c.instagram ? esc(c.instagram) : '—'}</div><div class="cstat-l">حساب انستغرام</div></div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `);

  const box = document.getElementById('client-search');
  if (state.searchQuery && box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
}

function openAddClientModal() {
  openModal(`
    <h3>إضافة عميل جديد</h3>
    <div class="field"><label>اسم الشركة *</label><input id="f-name" placeholder="مثال: مطعم البيت الشامي"><div class="err" id="err-name"></div></div>
    <div class="field"><label>المجال *</label><input id="f-industry" placeholder="مثال: مطاعم، تجميل، عقارات"><div class="err" id="err-industry"></div></div>
    <div class="field"><label>حساب انستغرام (اختياري)</label><input id="f-ig" placeholder="@username"></div>
    <div class="err" id="err-client-submit"></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="submit-client">إضافة</button></div>
  `);
}

async function submitAddClient(btn) {
  const name = document.getElementById('f-name').value.trim();
  const industry = document.getElementById('f-industry').value.trim();
  const instagram = document.getElementById('f-ig').value.trim();
  let ok = true;
  ok = setErr('err-name', !name && 'لازم تدخل اسم الشركة') && ok;
  ok = setErr('err-industry', !industry && 'لازم تدخل المجال') && ok;
  if (!ok) return;

  btn.disabled = true;
  try {
    await store.createClient({ name, industry, instagram });
    closeModal();
    toast('تمت إضافة العميل');
    showOverview();
  } catch (err) {
    setErr('err-client-submit', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}

async function toggleClientActive(btn) {
  const clientId = btn.dataset.id;
  const nextActive = btn.dataset.active !== 'true';
  btn.disabled = true;
  try {
    await store.setClientActive(clientId, nextActive);
    toast(nextActive ? 'تم تفعيل العميل' : 'تم تعطيل العميل');
    if (state.activeClient?.id === clientId) {
      state.activeClient = state.clients.find((client) => client.id === clientId) || null;
      renderClient();
    } else {
      renderOverview();
    }
  } catch (err) {
    toast(store.humanError(err), true);
    btn.disabled = false;
  }
}

function requestDeleteClient(clientId) {
  if (!can('settings') || state.currentUser.isAccessAccount === true) {
    toast('حذف العميل متاح للإدارة فقط', true);
    return;
  }
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) { toast('العميل غير موجود', true); return; }
  const contentCount = clientContent(clientId).length;
  const taskCount = clientTasks(clientId).length;
  openModal(`
    <div class="modal-title-icon danger"><i class="fi fi-rr-trash"></i></div>
    <h3>حذف العميل</h3>
    <p class="modal-hint">سيتم حذف «${esc(client.name)}» و${contentCount} عنصر محتوى مرتبط به. سيتم الاحتفاظ بـ${taskCount} مهمة قديمة وفصلها عن العميل حتى لا يضيع سجل الفريق.</p>
    <div class="client-delete-warning"><i class="fi fi-rr-triangle-warning"></i><span>هذا الإجراء نهائي ولا يمكن التراجع عنه.</span></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn danger" data-action="confirm-delete-client" data-id="${esc(clientId)}">تأكيد حذف العميل</button></div>
  `);
}

async function confirmDeleteClient(btn) {
  btn.disabled = true;
  try {
    await store.deleteClient(btn.dataset.id);
    state.activeClient = null;
    closeModal();
    toast('تم حذف العميل');
    await showOverview();
  } catch (err) {
    toast(store.humanError(err), true);
    btn.disabled = false;
  }
}

/* ---------- صفحة عميل واحد ---------- */

async function openClient(id) {
  state.activeClient = state.clients.find((c) => c.id === id) || null;
  state.activeTab = 'overview';
  state.contentPlatformFilter = 'all';
  state.contentDateFrom = '';
  state.contentDateTo = '';
  if (!state.activeClient) { showOverview(); return; }
  loading('عم نجيب بيانات العميل...');
  try { await store.loadContent(id); } catch (err) { /* بيضل يعرض الباقي */ }
  renderClient();
}

export function renderClient() {
  const c = state.activeClient;
  if (!c) { showOverview(); return; }
  const items = clientContent(c.id);
  const filteredItems = filteredClientContent(c.id);
  const hasContentFilters = state.contentPlatformFilter !== 'all' || state.contentDateFrom || state.contentDateTo;

  const TABS = [['overview', 'نظرة عامة'], ['brief', 'البريف'], ['content', 'المحتوى'],
    ['tasks', 'المهام'], ['calendar', 'التقويم'], ['analytics', 'التحليلات'], ['reports', 'التقارير']];

  const overviewBody = `
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">محتوى مسجل</div><div class="kpi-value mono">${items.length}</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي مشاهدات</div><div class="kpi-value mono">${totalViews(c.id).toLocaleString()}</div></div>
      <div class="kpi"><div class="kpi-label">مهام مرتبطة</div><div class="kpi-value mono">${clientTasks(c.id).length}</div></div>
      <div class="kpi"><div class="kpi-label">حساب انستغرام</div><div class="kpi-value" style="font-size:16px">${esc(c.instagram) || '—'}</div></div>
    </div>
    <div class="disclaimer"><b>حالة العمل:</b> العميل <strong class="client-inline-state ${c.active === false ? 'inactive' : 'active'}">${c.active === false ? 'غير نشط' : 'نشط'}</strong>. ${items.length === 0 ? 'لسا ما بلشنا نسجل محتوى لهاد العميل.' : `آخر محتوى مسجل: "${esc(items[items.length - 1].title)}".`} ${clientTasks(c.id).length ? `في ${clientTasks(c.id).length} مهمة مرتبطة فيه حالياً.` : 'ما في مهام مرتبطة فيه حالياً.'}</div>
  `;

  const b = c.brief || {};
  const briefBody = `
    <div class="brief-grid">
      <div class="brief-card"><h5>نبذة عن النشاط</h5><p>${esc(b.business) || '— لسا ما تسجلت'}</p></div>
      <div class="brief-card"><h5>الجمهور المستهدف</h5><p>${esc(b.audience) || '— لسا ما تسجل'}</p></div>
      <div class="brief-card"><h5>نبرة العلامة</h5><p>${esc(b.voice) || '— لسا ما تسجلت'}</p></div>
      <div class="brief-card"><h5>ملاحظات</h5><p>${esc(b.notes) || '— لا يوجد'}</p></div>
    </div>
    <div style="margin-top:14px;"><button class="btn ghost" data-action="edit-brief">تعديل البريف</button></div>
  `;

  const contentBody = `
    <div class="content-filter-panel">
      <div class="content-filter-heading">
        <div><span class="section-kicker">المحتوى المسجل</span><strong>${filteredItems.length} من ${items.length}</strong><small>${esc(contentFilterLabel())}</small></div>
        <button class="btn" data-action="add-content"><i class="fi fi-rr-plus"></i> تسجيل محتوى</button>
      </div>
      <div class="content-filter-controls">
        <label class="content-filter-field platform"><span>المنصة</span><select data-action="filter-content-platform">
          <option value="all" ${state.contentPlatformFilter === 'all' ? 'selected' : ''}>فيسبوك + انستغرام</option>
          <option value="instagram" ${state.contentPlatformFilter === 'instagram' ? 'selected' : ''}>انستغرام</option>
          <option value="facebook" ${state.contentPlatformFilter === 'facebook' ? 'selected' : ''}>فيسبوك</option>
        </select></label>
        <label class="content-filter-field"><span>من</span><input class="date-input" type="date" dir="ltr" aria-label="من" value="${esc(state.contentDateFrom)}" data-action="filter-content-from"></label>
        <label class="content-filter-field"><span>إلى</span><input class="date-input" type="date" dir="ltr" aria-label="إلى" value="${esc(state.contentDateTo)}" data-action="filter-content-to"></label>
        ${hasContentFilters ? `<button class="filter-reset" data-action="clear-content-filters"><i class="fi fi-rr-refresh"></i> مسح التصفية</button>` : ''}
      </div>
    </div>
    ${items.length === 0
      ? `<div class="empty-state"><div class="empty-title">لسا ما في محتوى مسجل لـ ${esc(c.name)}</div><div class="empty-sub">أول ما ينزل ريلز أو بوست، سجله هون وبنبدأ نبني الإحصائيات</div><button class="btn" data-action="add-content">+ تسجيل محتوى</button></div>`
      : filteredItems.length === 0
        ? `<div class="empty-state compact-filter-empty"><div class="empty-title">لا يوجد محتوى ضمن هذه الفترة</div><div class="empty-sub">غيّر المنصة أو التاريخ، أو امسح التصفية لعرض كل المحتوى.</div><button class="btn ghost" data-action="clear-content-filters">عرض كل المحتوى</button></div>`
        : `<div class="content-table-shell"><table class="content-table content-data-table">
          <colgroup><col class="content-title-col"><col class="content-platform-col"><col class="content-type-col"><col class="content-date-col"><col span="4" class="content-number-col"><col class="content-actions-col"></colgroup>
          <thead><tr><th>المحتوى</th><th>المنصة</th><th>النوع</th><th>التاريخ</th><th>المشاهدات</th><th>لايكات</th><th>تعليقات</th><th>مشاركات</th><th>الإجراء</th></tr></thead>
          <tbody>
            ${[...filteredItems].sort((a, b2) => contentDateKey(b2.date, b2.createdAt).localeCompare(contentDateKey(a.date, a.createdAt))).map((it) => `
              <tr>
                <td class="content-title-cell">${esc(it.title)}</td>
                <td><span class="platform-pill ${platformKey(it.platform)}">${platformLabel(it.platform)}</span></td>
                <td><span class="type-pill ${esc(it.type)}">${TYPE_LABEL[it.type] || esc(it.type)}</span></td>
                <td class="content-date-cell mono">${esc(formatContentDate(it.date, it.createdAt))}</td>
                <td class="content-metric-cell mono">${(Number(it.views) || 0).toLocaleString()}</td>
                <td class="content-metric-cell mono">${(Number(it.likes) || 0).toLocaleString()}</td>
                <td class="content-metric-cell mono">${Number(it.comments) || 0}</td>
                <td class="content-metric-cell mono">${Number(it.shares) || 0}</td>
                <td><div class="row-actions">
                  <button class="icon-btn" data-action="edit-content" data-id="${esc(it.id)}">تعديل</button>
                  <button class="icon-btn del" data-action="delete-content" data-id="${esc(it.id)}">حذف</button>
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`}
  `;

  const ts = clientTasks(c.id);
  const tasksBody = ts.length === 0
    ? `<div class="empty-state"><div class="empty-title">ما في مهام مرتبطة بهاد العميل</div></div>`
    : `<div class="table-scroll"><table class="content-table"><thead><tr><th>المهمة</th><th>الموظف</th><th>الأولوية</th><th>الموعد</th><th>الحالة</th></tr></thead>
        <tbody>${ts.map((t) => `<tr class="task-open-row" data-action="view-task" data-id="${esc(t.id)}"><td>${esc(t.title)}</td><td>${esc(employeeName(t.assigneeId))}</td><td><span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span></td><td class="mono" style="font-size:12px">${fmtDate(t.deadline)}</td><td>${STATUS_LABEL[t.status] || ''}</td></tr>`).join('')}</tbody></table></div>`;

  const calendarBody = (() => {
    const entries = filteredItems.map((it) => ({ date: formatContentDate(it.date, it.createdAt), label: `${platformLabel(it.platform)} · ${TYPE_LABEL[it.type] || it.type}: ${it.title}` }));
    ts.forEach((t) => entries.push({ date: fmtDate(t.deadline), label: `مهمة: ${t.title} (${employeeName(t.assigneeId)})` }));
    const groups = {};
    entries.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
    const dates = Object.keys(groups);
    if (dates.length === 0) return `<div class="empty-state"><div class="empty-title">ما في مواعيد مسجلة بعد</div></div>`;
    return `${hasContentFilters ? `<div class="analytics-filter-note"><i class="fi fi-rr-filter"></i><span>محتوى التقويم حسب: ${esc(contentFilterLabel())}</span><button data-action="set-client-tab" data-tab="content">تعديل الفترة</button></div>` : ''}${dates.map((d) => `<div class="cal-group"><div class="cal-date">${esc(d)}</div>${groups[d].map((e) => `<div class="cal-row"><span>${esc(e.label)}</span></div>`).join('')}</div>`).join('')}`;
  })();

  const analyticsBody = filteredItems.length === 0
    ? `<div class="empty-state"><div class="empty-title">ما في محتوى كفاية لبناء تحليل</div><div class="empty-sub">${items.length ? 'لا يوجد محتوى ضمن الفترة أو المنصة المختارة.' : 'سجل شوية محتوى الأول من تبويب "المحتوى"'}</div></div>`
    : (() => {
      const sorted = [...filteredItems].sort((a, b2) => (b2.views || 0) - (a.views || 0));
      const best = sorted.slice(0, 3);
      const worst = sorted.slice(-3).reverse();
      return `<div class="analytics-filter-note"><i class="fi fi-rr-filter"></i><span>التحليل حسب: ${esc(contentFilterLabel())}</span><button data-action="set-client-tab" data-tab="content">تعديل الفترة</button></div><div class="report-grid">
        <div class="report-card"><h4>الأعلى مشاهدة</h4>${best.map((x) => `<div class="rank-row best"><span class="rank-title">${esc(x.title)}</span><span class="rank-value mono">${(Number(x.views) || 0).toLocaleString()}</span></div>`).join('')}</div>
        <div class="report-card"><h4>الأقل مشاهدة</h4>${worst.map((x) => `<div class="rank-row worst"><span class="rank-title">${esc(x.title)}</span><span class="rank-value mono">${(Number(x.views) || 0).toLocaleString()}</span></div>`).join('')}</div>
      </div>`;
    })();

  const reportsBody = `
    <div class="empty-state">
      <div class="empty-title">تقرير محتوى ${esc(c.name)}</div>
      <div class="empty-sub">سيتم إعداد التقرير حسب الفلتر الحالي: ${esc(contentFilterLabel())}</div>
      <button class="btn" data-action="generate-report">توليد التقرير</button>
    </div>
  `;

  const bodies = { overview: overviewBody, brief: briefBody, content: contentBody, tasks: tasksBody, calendar: calendarBody, analytics: analyticsBody, reports: reportsBody };

  render(`
    <div class="back-link" data-action="back-to-clients">‹ رجوع لكل العملاء</div>
    <div class="topbar client-profile-head">
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="avatar" style="width:52px; height:52px; font-size:20px;">${esc((c.name || '؟')[0])}</div>
        <div><div class="page-title">${esc(c.name)}</div><div class="page-sub">${esc(c.industry)}${c.instagram ? ' · ' + esc(c.instagram) : ''} · <span class="client-inline-state ${c.active === false ? 'inactive' : 'active'}">${c.active === false ? 'غير نشط' : 'نشط'}</span></div></div>
      </div>
      <div class="client-manage-actions">${can('overview') && state.currentUser.isAccessAccount !== true ? `<button class="btn ghost" data-action="toggle-client-active" data-id="${esc(c.id)}" data-active="${c.active !== false}"><i class="fi ${c.active === false ? 'fi-rr-play' : 'fi-rr-pause'}"></i>${c.active === false ? 'تفعيل العميل' : 'تعطيل العميل'}</button>` : ''}${can('settings') && state.currentUser.isAccessAccount !== true ? `<button class="btn danger-outline" data-action="request-delete-client" data-id="${esc(c.id)}"><i class="fi fi-rr-trash"></i>حذف العميل</button>` : ''}</div>
    </div>
    <div class="tabs">
      ${TABS.map(([k, label]) => `<div class="tab ${state.activeTab === k ? 'active' : ''}" data-action="set-client-tab" data-tab="${k}">${label}</div>`).join('')}
    </div>
    ${bodies[state.activeTab] || overviewBody}
  `);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString(getDateLocale());
}

/* ---------- البريف ---------- */

function openBriefModal() {
  const b = state.activeClient.brief || {};
  openModal(`
    <h3>تعديل بريف ${esc(state.activeClient.name)}</h3>
    <div class="field"><label>نبذة عن النشاط</label><textarea id="b-business">${esc(b.business)}</textarea></div>
    <div class="field"><label>الجمهور المستهدف</label><textarea id="b-audience">${esc(b.audience)}</textarea></div>
    <div class="field"><label>نبرة العلامة</label><textarea id="b-voice">${esc(b.voice)}</textarea></div>
    <div class="field"><label>ملاحظات</label><textarea id="b-notes">${esc(b.notes)}</textarea></div>
    <div class="err" id="err-brief"></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="save-brief">حفظ</button></div>
  `);
}

async function saveBrief(btn) {
  const brief = {
    business: document.getElementById('b-business').value.trim(),
    audience: document.getElementById('b-audience').value.trim(),
    voice: document.getElementById('b-voice').value.trim(),
    notes: document.getElementById('b-notes').value.trim(),
  };
  btn.disabled = true;
  try {
    await store.saveClientBrief(state.activeClient.id, brief);
    state.activeClient = state.clients.find((c) => c.id === state.activeClient.id);
    closeModal();
    toast('انحفظ البريف');
    renderClient();
  } catch (err) {
    setErr('err-brief', store.humanError(err));
  } finally { btn.disabled = false; }
}

/* ---------- المحتوى ---------- */

function contentModal(existing) {
  const v = existing || { platform: 'instagram', type: 'reel', title: '', date: '', views: '', likes: '', comments: '', shares: '' };
  openModal(`
    <h3>${existing ? 'تعديل محتوى' : 'تسجيل محتوى جديد'}</h3>
    <div class="field"><label>المنصة *</label><select id="f-platform">
      <option value="instagram" ${(v.platform || 'instagram') === 'instagram' ? 'selected' : ''}>انستغرام</option>
      <option value="facebook" ${v.platform === 'facebook' ? 'selected' : ''}>فيسبوك</option>
    </select></div>
    <div class="field"><label>نوع المحتوى *</label><select id="f-type">
      <option value="reel" ${v.type === 'reel' ? 'selected' : ''}>ريلز</option>
      <option value="post" ${v.type === 'post' ? 'selected' : ''}>بوست</option>
      <option value="story" ${v.type === 'story' ? 'selected' : ''}>ستوري</option>
    </select></div>
    <div class="field"><label>عنوان/وصف مختصر *</label><input id="f-title" value="${esc(v.title)}" placeholder="مثال: وصفة كبة نية"><div class="err" id="err-title"></div></div>
    <div class="field"><label>التاريخ *</label><input id="f-date" class="date-input" type="date" dir="ltr" aria-label="التاريخ" value="${esc(contentDateKey(v.date, v.createdAt))}"><div class="err" id="err-date"></div></div>
    <div class="field"><label>المشاهدات *</label><input id="f-views" type="number" value="${esc(v.views)}" placeholder="0"><div class="err" id="err-views"></div></div>
    <div class="field"><label>لايكات</label><input id="f-likes" type="number" value="${esc(v.likes)}" placeholder="0"></div>
    <div class="field"><label>تعليقات</label><input id="f-comments" type="number" value="${esc(v.comments)}" placeholder="0"></div>
    <div class="field"><label>مشاركات</label><input id="f-shares" type="number" value="${esc(v.shares)}" placeholder="0"></div>
    <div class="err" id="err-content-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="save-content" data-id="${esc(existing ? existing.id : '')}">حفظ</button>
    </div>
  `);
}

function readContentForm() {
  const title = document.getElementById('f-title').value.trim();
  const date = document.getElementById('f-date').value.trim();
  const views = document.getElementById('f-views').value;
  let ok = true;
  ok = setErr('err-title', !title && 'لازم تدخل عنوان') && ok;
  ok = setErr('err-date', !date && 'لازم تدخل التاريخ') && ok;
  ok = setErr('err-views', views === '' && 'لازم تدخل رقم المشاهدات') && ok;
  if (!ok) return null;
  return {
    platform: document.getElementById('f-platform').value,
    type: document.getElementById('f-type').value,
    title, date,
    views: parseInt(views, 10) || 0,
    likes: parseInt(document.getElementById('f-likes').value, 10) || 0,
    comments: parseInt(document.getElementById('f-comments').value, 10) || 0,
    shares: parseInt(document.getElementById('f-shares').value, 10) || 0,
  };
}

async function saveContent(btn) {
  const data = readContentForm();
  if (!data) return;
  const contentId = btn.dataset.id;
  btn.disabled = true;
  try {
    if (contentId) await store.updateContent(state.activeClient.id, contentId, data);
    else await store.addContent(state.activeClient.id, data);
    closeModal();
    toast('انحفظ المحتوى');
    renderClient();
  } catch (err) {
    setErr('err-content-submit', store.humanError(err));
  } finally { btn.disabled = false; }
}

async function deleteContentItem(id) {
  if (!confirm('متأكد بدك تحذف هالمحتوى؟')) return;
  try {
    await store.deleteContent(state.activeClient.id, id);
    toast('انحذف المحتوى');
    renderClient();
  } catch (err) { toast(store.humanError(err), true); }
}

/* ---------- تقرير العميل ---------- */

function companyLetterhead(title, subtitle) {
  return `<header class="company-print-letterhead">
    <div class="company-letterhead-logo"><img src="assets/najran-letterhead.png" alt="Najran Agency"></div>
    <div class="company-letterhead-copy"><span>NAJRAN AGENCY</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
  </header>`;
}

function openReportPreview() {
  const c = state.activeClient;
  const items = filteredClientContent(c.id);
  const sorted = [...items].sort((a, b2) => (b2.views || 0) - (a.views || 0));
  const views = itemsTotal(items, 'views');
  const likes = itemsTotal(items, 'likes');
  const engagement = likes + itemsTotal(items, 'comments') + itemsTotal(items, 'shares');
  const generatedAt = new Date().toLocaleDateString(getDateLocale(), { day: '2-digit', month: 'long', year: 'numeric' });
  openModal(`
    <div class="print-report" id="client-print-report">
      ${companyLetterhead(`تقرير أداء المحتوى — ${c.name}`, `${contentFilterLabel()} · تاريخ الإصدار ${generatedAt}`)}
      <div class="client-report-summary">
        <article><small>المحتوى</small><strong>${items.length}</strong></article>
        <article><small>المشاهدات</small><strong>${views.toLocaleString()}</strong></article>
        <article><small>الإعجابات</small><strong>${likes.toLocaleString()}</strong></article>
        <article><small>التفاعلات</small><strong>${engagement.toLocaleString()}</strong></article>
      </div>
      ${sorted.length ? `<section class="client-print-section content-details"><h2>تفاصيل المحتوى</h2><div class="client-print-table-wrap"><table class="print-content-table"><thead><tr><th>المحتوى</th><th>المنصة</th><th>النوع</th><th>التاريخ</th><th>المشاهدات</th><th>التفاعل</th></tr></thead><tbody>${sorted.map((item) => `<tr><td>${esc(item.title)}</td><td>${platformLabel(item.platform)}</td><td>${esc(TYPE_LABEL[item.type] || item.type)}</td><td>${esc(formatContentDate(item.date, item.createdAt))}</td><td>${(Number(item.views) || 0).toLocaleString()}</td><td>${((Number(item.likes) || 0) + (Number(item.comments) || 0) + (Number(item.shares) || 0)).toLocaleString()}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="client-print-section top-content"><h2>الأعلى أداءً</h2>${sorted.slice(0, 3).map((item, index) => `<div class="rank-row best"><span class="report-rank">${index + 1}</span><span class="rank-title">${esc(item.title)}</span><span class="rank-value mono">${(Number(item.views) || 0).toLocaleString()}</span></div>`).join('')}</section>` : `<div class="client-report-empty">لا يوجد محتوى ضمن الفترة المختارة.</div>`}
    </div>
    <div class="modal-actions" style="margin-top:18px;"><button class="btn ghost" data-action="close-modal">إغلاق</button><button class="btn" data-action="print">تصدير PDF</button></div>
  `);
}

function printClientReport() {
  document.body.classList.add('printing-client-report');
  const cleanup = () => document.body.classList.remove('printing-client-report');
  window.addEventListener('afterprint', cleanup, { once: true });
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function setContentRange(which, value) {
  if (which === 'from') state.contentDateFrom = value;
  else state.contentDateTo = value;
  if (state.contentDateFrom && state.contentDateTo && state.contentDateFrom > state.contentDateTo) {
    if (which === 'from') state.contentDateTo = state.contentDateFrom;
    else state.contentDateFrom = state.contentDateTo;
  }
  renderClient();
}

function clearContentFilters() {
  state.contentPlatformFilter = 'all';
  state.contentDateFrom = '';
  state.contentDateTo = '';
  renderClient();
}

/* ---------- التقارير الشهرية لكل الوكالة ---------- */

export async function showAgencyReport() {
  loading('عم نبني التقرير...');
  try {
    await Promise.all([store.loadClients(), store.loadAllContent()]);
  } catch (err) {
    errorState('تعذر بناء التقرير', store.humanError(err));
    return;
  }
  if (state.clients.length === 0) {
    render(`<div class="topbar"><div><div class="page-title">التقارير الشهرية</div><div class="page-sub">تقرير شامل لكل عملاء الوكالة</div></div></div>
      <div class="empty-state"><div class="empty-title">ما في عملاء بعد</div><div class="empty-sub">ضيف عملاء وسجل محتواهم حتى يظهر هون تقرير مقارن</div></div>`);
    return;
  }

  const ranked = state.clients.map((c) => {
    const items = clientContent(c.id);
    const views = totalViews(c.id);
    const inter = items.reduce((s, i) => s + (Number(i.likes) || 0) + (Number(i.comments) || 0) + (Number(i.shares) || 0), 0);
    return { name: c.name, industry: c.industry, views, count: items.length, engagement: items.length ? (inter / Math.max(views, 1)) * 100 : 0 };
  }).sort((a, b2) => b2.views - a.views);

  const best = ranked.find((r) => r.count > 0);
  const worst = [...ranked].filter((r) => r.count > 0).sort((a, b2) => a.views - b2.views)[0];
  const month = new Date().toLocaleDateString(getDateLocale(), { month: 'long', year: 'numeric' });

  render(`
    <div class="topbar"><div><div class="page-title">التقارير الشهرية</div><div class="page-sub">مقارنة أداء كل العملاء — ${esc(month)}</div></div></div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">أفضل عميل بالمشاهدات</div><div class="kpi-value" style="font-size:16px">${best ? esc(best.name) : '—'}</div><div class="kpi-delta">${best ? best.views.toLocaleString() + ' مشاهدة' : ''}</div></div>
      <div class="kpi"><div class="kpi-label">أقل عميل بالمشاهدات</div><div class="kpi-value" style="font-size:16px">${worst ? esc(worst.name) : '—'}</div><div class="kpi-delta">${worst ? worst.views.toLocaleString() + ' مشاهدة' : ''}</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي المشاهدات</div><div class="kpi-value mono">${ranked.reduce((s, r) => s + r.views, 0).toLocaleString()}</div><div class="kpi-delta">عبر كل العملاء</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي المحتوى</div><div class="kpi-value mono">${ranked.reduce((s, r) => s + r.count, 0)}</div><div class="kpi-delta">المسجّل بالنظام</div></div>
    </div>
    <table class="content-table">
      <thead><tr><th>العميل</th><th>المجال</th><th>عدد المحتوى</th><th>إجمالي المشاهدات</th><th>معدل التفاعل</th></tr></thead>
      <tbody>${ranked.map((r, i) => `<tr><td>${i === 0 && r.count > 0 ? '⭐ ' : ''}${esc(r.name)}</td><td>${esc(r.industry)}</td><td class="mono">${r.count}</td><td class="mono">${r.views.toLocaleString()}</td><td class="mono">${r.count ? r.engagement.toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="disclaimer"><b>ملاحظة:</b> معدل التفاعل = (لايكات + تعليقات + مشاركات) ÷ المشاهدات. مقياس تقريبي لحد ما يصير الربط الحقيقي مع Meta API.</div>
  `);
}

/* ---------- الأفعال يلي بتنربط بالأزرار ---------- */

export const actions = {
  'add-client': () => openAddClientModal(),
  'submit-client': (el) => submitAddClient(el),
  'open-client': (el) => openClient(el.dataset.id),
  'toggle-client-active': (el) => toggleClientActive(el),
  'request-delete-client': (el) => requestDeleteClient(el.dataset.id),
  'confirm-delete-client': (el) => confirmDeleteClient(el),
  'back-to-clients': () => showOverview(),
  'set-client-tab': (el) => { state.activeTab = el.dataset.tab; renderClient(); },
  'search-clients': (el) => { state.searchQuery = el.value; renderOverview(); },
  'filter-industry': (el) => { state.filterIndustry = el.value; renderOverview(); },
  'filter-client-status': (el) => { state.clientStatusFilter = el.value; renderOverview(); },
  'edit-brief': () => openBriefModal(),
  'save-brief': (el) => saveBrief(el),
  'add-content': () => contentModal(null),
  'edit-content': (el) => contentModal(clientContent(state.activeClient.id).find((x) => x.id === el.dataset.id)),
  'save-content': (el) => saveContent(el),
  'delete-content': (el) => deleteContentItem(el.dataset.id),
  'filter-content-platform': (el) => { state.contentPlatformFilter = el.value; renderClient(); },
  'filter-content-from': (el) => setContentRange('from', el.value),
  'filter-content-to': (el) => setContentRange('to', el.value),
  'clear-content-filters': () => clearContentFilters(),
  'generate-report': () => openReportPreview(),
  print: () => printClientReport(),
};
