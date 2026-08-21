// ============ المالية — دفعات ومصاريف كل عميل (لصاحب صلاحية "المالية" بس) ============
import { state, esc, employeeName } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import * as store from '../store.js';

const num = (v) => Number(v) || 0;

export async function showFinance() {
  loading('عم نجيب البيانات المالية...');
  try {
    await Promise.all([store.loadClients(), store.loadFinance()]);
    if (state.employees.length === 0) { await store.loadRoles().catch(() => {}); await store.loadEmployees().catch(() => {}); }
  } catch (err) {
    errorState('تعذر تحميل المالية', store.humanError(err));
    return;
  }

  if (state.clients.length === 0) {
    render(`<div class="topbar"><div><div class="page-title">المالية</div><div class="page-sub">المصاريف والدفعات لكل عميل</div></div></div>
      <div class="empty-state"><div class="empty-title">ما في عملاء بعد</div><div class="empty-sub">ضيف عملاء من "نظرة عامة" وبعدين سجّل أرقامهم هون</div></div>`);
    return;
  }

  const rows = state.clients.map((c) => {
    const f = state.finance[c.id] || {};
    const advance = num(f.advancePaid);
    const extra = num(f.extraExpenses);
    return { c, advance, extra, total: advance + extra };
  });
  const grand = rows.reduce((s, r) => s + r.total, 0);

  render(`
    <div class="topbar"><div><div class="page-title">المالية</div><div class="page-sub">المصاريف والدفعات لكل عميل</div></div></div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">المجموع الكامل</div><div class="kpi-value mono" style="color:var(--accent)">${grand.toLocaleString()}</div><div class="kpi-delta">عبر كل العملاء</div></div>
      <div class="kpi"><div class="kpi-label">مدفوع مقدماً</div><div class="kpi-value mono">${rows.reduce((s, r) => s + r.advance, 0).toLocaleString()}</div></div>
      <div class="kpi"><div class="kpi-label">مصاريف زائدة</div><div class="kpi-value mono">${rows.reduce((s, r) => s + r.extra, 0).toLocaleString()}</div></div>
      <div class="kpi"><div class="kpi-label">عملاء مسجّل لهم أرقام</div><div class="kpi-value mono">${rows.filter((r) => r.total > 0).length}</div><div class="kpi-delta">من ${rows.length}</div></div>
    </div>
    <table class="content-table">
      <thead><tr><th>العميل</th><th>مدفوع مقدماً</th><th>مصاريف زائدة</th><th>المجموع الكامل</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td>${esc(r.c.name)}</td>
          <td class="mono">${r.advance.toLocaleString()}</td>
          <td class="mono">${r.extra.toLocaleString()}</td>
          <td class="mono" style="font-weight:900; color:var(--accent)">${r.total.toLocaleString()}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-action="open-finance" data-id="${esc(r.c.id)}">تعديل</button>
            <button class="icon-btn" data-action="finance-history" data-id="${esc(r.c.id)}">السجل</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="disclaimer"><b>ملاحظة:</b> المجموع الكامل = المدفوع مقدماً + المصاريف الزائدة. كل حفظة بتنسجل بسجل دائم (مين عدّل، وشو كانت الأرقام وقتها) — ما بينمسح أبداً.</div>
  `);
}

function openFinanceModal(clientId) {
  const c = state.clients.find((x) => x.id === clientId);
  const f = state.finance[clientId] || {};
  openModal(`
    <h3>مالية ${esc(c.name)}</h3>
    <div class="field"><label>مدفوع مقدماً</label><input id="fin-advance" type="number" step="0.01" value="${num(f.advancePaid)}" placeholder="0"></div>
    <div class="field"><label>مصاريف زائدة</label><input id="fin-expenses" type="number" step="0.01" value="${num(f.extraExpenses)}" placeholder="0"></div>
    <div class="err" id="err-fin"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="save-finance" data-id="${esc(clientId)}">حفظ</button>
    </div>
  `);
}

async function saveFinance(btn) {
  const clientId = btn.dataset.id;
  const advance = num(document.getElementById('fin-advance').value);
  const extra = num(document.getElementById('fin-expenses').value);
  btn.disabled = true;
  try {
    await store.saveFinance(clientId, advance, extra);
    closeModal();
    toast('انحفظت الأرقام');
    showFinance();
  } catch (err) {
    const el = document.getElementById('err-fin');
    el.textContent = store.humanError(err);
    el.style.display = 'block';
  } finally { btn.disabled = false; }
}

async function showHistory(clientId) {
  const c = state.clients.find((x) => x.id === clientId);
  let history = [];
  try { history = await store.loadFinanceHistory(clientId); } catch (err) { toast(store.humanError(err), true); return; }

  openModal(`
    <h3>سجل تعديلات ${esc(c.name)}</h3>
    ${history.length === 0 ? '<div class="task-empty">ما في تعديلات مسجلة بعد</div>' : `
      <table class="content-table" style="font-size:12px;">
        <thead><tr><th>التاريخ</th><th>مين</th><th>مقدماً</th><th>زائدة</th></tr></thead>
        <tbody>${history.map((h) => `<tr>
          <td class="mono" style="font-size:11px">${h.createdAt ? new Date(h.createdAt).toLocaleString('ar') : '—'}</td>
          <td>${esc(employeeName(h.employeeId))}</td>
          <td class="mono">${num(h.advancePaid).toLocaleString()}</td>
          <td class="mono">${num(h.extraExpenses).toLocaleString()}</td>
        </tr>`).join('')}</tbody>
      </table>
    `}
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إغلاق</button></div>
  `);
}

export const actions = {
  'open-finance': (el) => openFinanceModal(el.dataset.id),
  'save-finance': (el) => saveFinance(el),
  'finance-history': (el) => showHistory(el.dataset.id),
};
