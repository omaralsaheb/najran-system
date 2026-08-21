// ============ العملاء + المحتوى + البريف + التقارير ============
import { state, esc, TYPE_LABEL, PRIO_LABEL, STATUS_LABEL, employeeName } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import * as store from '../store.js';

const clientContent = (id) => state.content[id] || [];
const totalViews = (id) => clientContent(id).reduce((s, i) => s + (Number(i.views) || 0), 0);
const clientTasks = (id) => state.tasks.filter((t) => t.clientId === id);

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
function renderOverview() {
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
    return s && i;
  });
  const totalContent = state.clients.reduce((s, c) => s + clientContent(c.id).length, 0);

  render(`
    <div class="topbar">
      <div><div class="page-title">نظرة عامة</div><div class="page-sub">${state.clients.length} عملاء</div></div>
      <button class="btn" data-action="add-client">+ إضافة عميل</button>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">عدد العملاء</div><div class="kpi-value mono">${state.clients.length}</div><div class="kpi-delta">مسجلين بالنظام</div></div>
      <div class="kpi"><div class="kpi-label">محتوى مسجل</div><div class="kpi-value mono">${totalContent}</div><div class="kpi-delta">ريلز، بوست، ستوري</div></div>
      <div class="kpi"><div class="kpi-label">أعضاء الفريق</div><div class="kpi-value mono">${state.employees.length}</div><div class="kpi-delta">موظفين نشطين</div></div>
      <div class="kpi"><div class="kpi-label">مهام مفتوحة</div><div class="kpi-value mono">${state.tasks.filter((t) => t.status !== 'done').length}</div><div class="kpi-delta">عبر كل العملاء</div></div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="client-search" placeholder="ابحث باسم العميل..." value="${esc(state.searchQuery)}" data-action="search-clients">
      <select class="filter-select" data-action="filter-industry">
        <option value="all" ${state.filterIndustry === 'all' ? 'selected' : ''}>كل المجالات</option>
        ${industries.map((i) => `<option value="${esc(i)}" ${state.filterIndustry === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}
      </select>
    </div>
    ${filtered.length === 0 ? `<div class="empty-state"><div class="empty-title">ما في نتائج مطابقة</div><div class="empty-sub">جرب كلمة بحث تانية أو غيّر الفلتر</div></div>` : `
      <div class="clients-grid">
        ${filtered.map((c) => `
          <div class="client-card" data-action="open-client" data-id="${esc(c.id)}">
            <div class="client-top">
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="avatar">${esc((c.name || '؟')[0])}</div>
                <div><div class="client-name">${esc(c.name)}</div><div class="client-industry">${esc(c.industry)}</div></div>
              </div>
              <span class="badge">${clientContent(c.id).length} محتوى</span>
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

/* ---------- صفحة عميل واحد ---------- */

async function openClient(id) {
  state.activeClient = state.clients.find((c) => c.id === id) || null;
  state.activeTab = 'overview';
  if (!state.activeClient) { showOverview(); return; }
  loading('عم نجيب بيانات العميل...');
  try { await store.loadContent(id); } catch (err) { /* بيضل يعرض الباقي */ }
  renderClient();
}

export function renderClient() {
  const c = state.activeClient;
  if (!c) { showOverview(); return; }
  const items = clientContent(c.id);

  const TABS = [['overview', 'نظرة عامة'], ['brief', 'البريف'], ['content', 'المحتوى'],
    ['tasks', 'المهام'], ['calendar', 'التقويم'], ['analytics', 'التحليلات'], ['reports', 'التقارير']];

  const overviewBody = `
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">محتوى مسجل</div><div class="kpi-value mono">${items.length}</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي مشاهدات</div><div class="kpi-value mono">${totalViews(c.id).toLocaleString()}</div></div>
      <div class="kpi"><div class="kpi-label">مهام مرتبطة</div><div class="kpi-value mono">${clientTasks(c.id).length}</div></div>
      <div class="kpi"><div class="kpi-label">حساب انستغرام</div><div class="kpi-value" style="font-size:16px">${esc(c.instagram) || '—'}</div></div>
    </div>
    <div class="disclaimer"><b>حالة العمل:</b> ${items.length === 0 ? 'لسا ما بلشنا نسجل محتوى لهاد العميل.' : `آخر محتوى مسجل: "${esc(items[items.length - 1].title)}".`} ${clientTasks(c.id).length ? `في ${clientTasks(c.id).length} مهمة مرتبطة فيه حالياً.` : 'ما في مهام مرتبطة فيه حالياً.'}</div>
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

  const contentBody = items.length === 0
    ? `<div class="empty-state"><div class="empty-title">لسا ما في محتوى مسجل لـ ${esc(c.name)}</div><div class="empty-sub">أول ما ينزل ريلز أو بوست، سجله هون وبنبدأ نبني الإحصائيات</div><button class="btn" data-action="add-content">+ تسجيل محتوى</button></div>`
    : `
      <div style="display:flex; justify-content:flex-end; margin-bottom:12px;"><button class="btn" data-action="add-content">+ تسجيل محتوى</button></div>
      <table class="content-table">
        <thead><tr><th>المحتوى</th><th>النوع</th><th>التاريخ</th><th>المشاهدات</th><th>لايكات</th><th>تعليقات</th><th>مشاركات</th><th></th></tr></thead>
        <tbody>
          ${[...items].reverse().map((it) => `
            <tr>
              <td>${esc(it.title)}</td>
              <td><span class="type-pill ${esc(it.type)}">${TYPE_LABEL[it.type] || esc(it.type)}</span></td>
              <td class="mono" style="font-size:12px">${esc(it.date)}</td>
              <td class="mono">${(Number(it.views) || 0).toLocaleString()}</td>
              <td class="mono">${(Number(it.likes) || 0).toLocaleString()}</td>
              <td class="mono">${Number(it.comments) || 0}</td>
              <td class="mono">${Number(it.shares) || 0}</td>
              <td><div class="row-actions">
                <button class="icon-btn" data-action="edit-content" data-id="${esc(it.id)}">تعديل</button>
                <button class="icon-btn del" data-action="delete-content" data-id="${esc(it.id)}">حذف</button>
              </div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  const ts = clientTasks(c.id);
  const tasksBody = ts.length === 0
    ? `<div class="empty-state"><div class="empty-title">ما في مهام مرتبطة بهاد العميل</div></div>`
    : `<table class="content-table"><thead><tr><th>المهمة</th><th>الموظف</th><th>الأولوية</th><th>الموعد</th><th>الحالة</th></tr></thead>
        <tbody>${ts.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(employeeName(t.assigneeId))}</td><td><span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span></td><td class="mono" style="font-size:12px">${fmtDate(t.deadline)}</td><td>${STATUS_LABEL[t.status] || ''}</td></tr>`).join('')}</tbody></table>`;

  const calendarBody = (() => {
    const entries = items.map((it) => ({ date: it.date, label: `${TYPE_LABEL[it.type] || it.type}: ${it.title}` }));
    ts.forEach((t) => entries.push({ date: fmtDate(t.deadline), label: `مهمة: ${t.title} (${employeeName(t.assigneeId)})` }));
    const groups = {};
    entries.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
    const dates = Object.keys(groups);
    if (dates.length === 0) return `<div class="empty-state"><div class="empty-title">ما في مواعيد مسجلة بعد</div></div>`;
    return dates.map((d) => `<div class="cal-group"><div class="cal-date">${esc(d)}</div>${groups[d].map((e) => `<div class="cal-row"><span>${esc(e.label)}</span></div>`).join('')}</div>`).join('');
  })();

  const analyticsBody = items.length === 0
    ? `<div class="empty-state"><div class="empty-title">ما في محتوى كفاية لبناء تحليل</div><div class="empty-sub">سجل شوية محتوى الأول من تبويب "المحتوى"</div></div>`
    : (() => {
      const sorted = [...items].sort((a, b2) => (b2.views || 0) - (a.views || 0));
      const best = sorted.slice(0, 3);
      const worst = sorted.slice(-3).reverse();
      return `<div class="report-grid">
        <div class="report-card"><h4>الأعلى مشاهدة</h4>${best.map((x) => `<div class="rank-row best"><span class="rank-title">${esc(x.title)}</span><span class="rank-value mono">${(Number(x.views) || 0).toLocaleString()}</span></div>`).join('')}</div>
        <div class="report-card"><h4>الأقل مشاهدة</h4>${worst.map((x) => `<div class="rank-row worst"><span class="rank-title">${esc(x.title)}</span><span class="rank-value mono">${(Number(x.views) || 0).toLocaleString()}</span></div>`).join('')}</div>
      </div>`;
    })();

  const reportsBody = `
    <div class="empty-state">
      <div class="empty-title">تقرير ${esc(c.name)} الشهري</div>
      <div class="empty-sub">لخّص أداء الشهر بضغطة وحدة، وصدّره PDF لإرساله للعميل</div>
      <button class="btn" data-action="generate-report">توليد التقرير</button>
    </div>
  `;

  const bodies = { overview: overviewBody, brief: briefBody, content: contentBody, tasks: tasksBody, calendar: calendarBody, analytics: analyticsBody, reports: reportsBody };

  render(`
    <div class="back-link" data-action="back-to-clients">‹ رجوع لكل العملاء</div>
    <div class="topbar">
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="avatar" style="width:52px; height:52px; font-size:20px;">${esc((c.name || '؟')[0])}</div>
        <div><div class="page-title">${esc(c.name)}</div><div class="page-sub">${esc(c.industry)}${c.instagram ? ' · ' + esc(c.instagram) : ''}</div></div>
      </div>
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
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString('ar');
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
  const v = existing || { type: 'reel', title: '', date: '', views: '', likes: '', comments: '', shares: '' };
  openModal(`
    <h3>${existing ? 'تعديل محتوى' : 'تسجيل محتوى جديد'}</h3>
    <div class="field"><label>نوع المحتوى *</label><select id="f-type">
      <option value="reel" ${v.type === 'reel' ? 'selected' : ''}>ريلز</option>
      <option value="post" ${v.type === 'post' ? 'selected' : ''}>بوست</option>
      <option value="story" ${v.type === 'story' ? 'selected' : ''}>ستوري</option>
    </select></div>
    <div class="field"><label>عنوان/وصف مختصر *</label><input id="f-title" value="${esc(v.title)}" placeholder="مثال: وصفة كبة نية"><div class="err" id="err-title"></div></div>
    <div class="field"><label>التاريخ *</label><input id="f-date" value="${esc(v.date)}" placeholder="مثال: 15 آب"><div class="err" id="err-date"></div></div>
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

function openReportPreview() {
  const c = state.activeClient;
  const items = clientContent(c.id);
  const sorted = [...items].sort((a, b2) => (b2.views || 0) - (a.views || 0));
  const month = new Date().toLocaleDateString('ar', { month: 'long', year: 'numeric' });
  openModal(`
    <div class="print-report">
      <h3>تقرير ${esc(c.name)} — ${esc(month)}</h3>
      <p style="font-size:12px; color:var(--text-dim); margin:6px 0 16px 0;">Najran Agency · تقرير أداء شهري</p>
      <div class="report-card" style="margin-bottom:10px;"><h4>ملخص</h4>
        <div class="rank-row"><span class="rank-title">عدد المحتوى المنشور</span><span class="rank-value mono">${items.length}</span></div>
        <div class="rank-row"><span class="rank-title">إجمالي المشاهدات</span><span class="rank-value mono">${totalViews(c.id).toLocaleString()}</span></div>
      </div>
      ${sorted.length ? `<div class="report-card"><h4>الأعلى أداءً</h4>${sorted.slice(0, 3).map((x) => `<div class="rank-row best"><span class="rank-title">${esc(x.title)}</span><span class="rank-value mono">${(Number(x.views) || 0).toLocaleString()}</span></div>`).join('')}</div>` : ''}
    </div>
    <div class="modal-actions" style="margin-top:18px;"><button class="btn ghost" data-action="close-modal">إغلاق</button><button class="btn" data-action="print">تصدير PDF</button></div>
  `);
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
  const month = new Date().toLocaleDateString('ar', { month: 'long', year: 'numeric' });

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
  'back-to-clients': () => showOverview(),
  'set-client-tab': (el) => { state.activeTab = el.dataset.tab; renderClient(); },
  'search-clients': (el) => { state.searchQuery = el.value; renderOverview(); },
  'filter-industry': (el) => { state.filterIndustry = el.value; renderOverview(); },
  'edit-brief': () => openBriefModal(),
  'save-brief': (el) => saveBrief(el),
  'add-content': () => contentModal(null),
  'edit-content': (el) => contentModal(clientContent(state.activeClient.id).find((x) => x.id === el.dataset.id)),
  'save-content': (el) => saveContent(el),
  'delete-content': (el) => deleteContentItem(el.dataset.id),
  'generate-report': () => openReportPreview(),
  print: () => window.print(),
};

