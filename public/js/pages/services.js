// ============ خدمات الشركة: الحضور، الطلبات، والإعلانات ============
import { state, esc, employeeName } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import * as store from '../store.js';

const TYPE = { leave: 'إجازة', purchase: 'مشتريات', maintenance: 'صيانة', other: 'طلب آخر' };
const STATUS = { pending: 'بانتظار المراجعة', approved: 'موافق عليه', rejected: 'مرفوض' };
const STATUS_ICON = { pending: 'fi-rr-time-quarter-past', approved: 'fi-rr-check-circle', rejected: 'fi-rr-cross-circle' };
const isManager = () => state.currentUser.permissions.includes('team') || state.currentUser.permissions.includes('settings');

function dateText(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
}

export async function showServices() {
  loading('جاري تحميل خدمات الشركة...');
  try {
    await Promise.all([store.loadServiceRequests(), store.loadAnnouncements(), store.loadTodayAttendance()]);
    if (!state.employees.length) await store.loadEmployees().catch(() => {});
  } catch (err) {
    errorState('تعذر تحميل خدمات الشركة', store.humanError(err));
    return;
  }
  renderServices();
}

function renderServices() {
  const mine = state.serviceRequests.filter((r) => r.employeeId === state.currentUser.id);
  const visible = isManager() ? state.serviceRequests : mine;
  const today = state.attendance[state.currentUser.id] || {};
  const pending = state.serviceRequests.filter((r) => r.status === 'pending').length;

  render(`
    <section class="service-hero">
      <div>
        <span class="section-kicker"><i class="fi fi-rr-briefcase"></i> مركز الخدمة الداخلية</span>
        <h1>كل احتياجات الفريق بمكان واحد</h1>
        <p>حضور وانصراف، طلبات إدارية، ومتابعة إعلانات الشركة بدون رسائل متفرقة.</p>
      </div>
      <button class="btn" data-action="new-service-request"><i class="fi fi-rr-plus"></i> طلب جديد</button>
    </section>

    <div class="service-kpis">
      <div class="service-kpi"><span class="service-icon amber"><i class="fi fi-rr-document-signed"></i></span><div><strong>${mine.length}</strong><small>طلباتي</small></div></div>
      <div class="service-kpi"><span class="service-icon blue"><i class="fi fi-rr-hourglass-end"></i></span><div><strong>${isManager() ? pending : mine.filter((r) => r.status === 'pending').length}</strong><small>بانتظار المراجعة</small></div></div>
      <div class="service-kpi"><span class="service-icon green"><i class="fi fi-rr-megaphone"></i></span><div><strong>${state.announcements.length}</strong><small>إعلانات داخلية</small></div></div>
    </div>

    <div class="services-layout">
      <div class="services-main">
        <div class="section-head"><div><span class="section-kicker">الطلبات الإدارية</span><h2>${isManager() ? 'طلبات الفريق' : 'طلباتي'}</h2></div></div>
        <div class="request-list">
          ${visible.length ? visible.map((r) => `
            <article class="request-card">
              <span class="request-type"><i class="fi ${r.type === 'leave' ? 'fi-rr-calendar-day' : r.type === 'purchase' ? 'fi-rr-shopping-cart' : r.type === 'maintenance' ? 'fi-rr-tools' : 'fi-rr-document'}"></i></span>
              <div class="request-body">
                <div class="request-top"><strong>${esc(TYPE[r.type] || TYPE.other)}</strong><span class="request-status ${esc(r.status)}"><i class="fi ${STATUS_ICON[r.status] || STATUS_ICON.pending}"></i>${esc(STATUS[r.status] || STATUS.pending)}</span></div>
                <p>${esc(r.details)}</p>
                <small>${esc(employeeName(r.employeeId))} · ${dateText(r.createdAt)}</small>
              </div>
              ${isManager() && r.status === 'pending' ? `<div class="request-actions"><button class="icon-btn approve" data-action="review-request" data-id="${esc(r.id)}" data-status="approved">موافقة</button><button class="icon-btn del" data-action="review-request" data-id="${esc(r.id)}" data-status="rejected">رفض</button></div>` : ''}
            </article>
          `).join('') : `<div class="soft-empty"><i class="fi fi-rr-inbox"></i><strong>لا توجد طلبات حالياً</strong><span>أي طلب جديد سيظهر هنا مع حالته.</span></div>`}
        </div>
      </div>

      <aside class="services-side">
        <div class="attendance-card">
          <div class="attendance-head"><span class="service-icon green"><i class="fi fi-rr-fingerprint"></i></span><div><strong>دوام اليوم</strong><small>${new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div></div>
          <div class="attendance-times"><div><small>دخول</small><strong>${today.checkIn ? new Date(today.checkIn).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div><div><small>خروج</small><strong>${today.checkOut ? new Date(today.checkOut).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div></div>
          ${!today.checkIn ? `<button class="btn attendance-btn" data-action="attendance" data-kind="in"><i class="fi fi-rr-sign-in-alt"></i> تسجيل الحضور</button>` : !today.checkOut ? `<button class="btn ghost attendance-btn" data-action="attendance" data-kind="out"><i class="fi fi-rr-sign-out-alt"></i> تسجيل الانصراف</button>` : `<div class="attendance-done"><i class="fi fi-rr-check-circle"></i> اكتمل دوام اليوم</div>`}
        </div>

        <div class="announcements-card">
          <div class="section-head compact"><div><span class="section-kicker">آخر الأخبار</span><h2>إعلانات الشركة</h2></div>${isManager() ? `<button class="icon-round" data-action="new-announcement" title="إعلان جديد"><i class="fi fi-rr-plus"></i></button>` : ''}</div>
          ${state.announcements.length ? state.announcements.slice(0, 5).map((a, i) => `<article class="announcement ${i === 0 ? 'featured' : ''}"><span></span><div><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p><small>${dateText(a.createdAt)}</small></div></article>`).join('') : `<div class="soft-empty small"><i class="fi fi-rr-megaphone"></i><span>لا توجد إعلانات بعد</span></div>`}
        </div>
      </aside>
    </div>
  `);
}

function openRequestModal() {
  closeModal();
  openModal(`
    <div class="modal-title-icon"><i class="fi fi-rr-paper-plane"></i></div><h3>طلب إداري جديد</h3>
    <div class="field"><label>نوع الطلب</label><select id="sr-type"><option value="leave">إجازة</option><option value="purchase">مشتريات</option><option value="maintenance">صيانة</option><option value="other">طلب آخر</option></select></div>
    <div class="field"><label>التفاصيل *</label><textarea id="sr-details" rows="5" placeholder="اكتب التفاصيل المطلوبة بوضوح..."></textarea><div class="err" id="err-sr"></div></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="submit-service-request">إرسال الطلب</button></div>
  `);
}

async function submitRequest(btn) {
  const details = document.getElementById('sr-details').value.trim();
  if (details.length < 5) { const e = document.getElementById('err-sr'); e.textContent = 'اكتب تفاصيل أوضح للطلب'; e.style.display = 'block'; return; }
  btn.disabled = true;
  try { await store.createServiceRequest(document.getElementById('sr-type').value, details); closeModal(); toast('تم إرسال الطلب للمراجعة'); showServices(); }
  catch (err) { toast(store.humanError(err), true); }
  finally { btn.disabled = false; }
}

function openAnnouncementModal() {
  openModal(`<div class="modal-title-icon"><i class="fi fi-rr-megaphone"></i></div><h3>إعلان داخلي جديد</h3><div class="field"><label>العنوان *</label><input id="an-title" placeholder="عنوان مختصر"></div><div class="field"><label>التفاصيل *</label><textarea id="an-body" rows="5" placeholder="نص الإعلان..."></textarea><div class="err" id="err-an"></div></div><div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="submit-announcement">نشر الإعلان</button></div>`);
}

async function submitAnnouncement(btn) {
  const title = document.getElementById('an-title').value.trim();
  const body = document.getElementById('an-body').value.trim();
  if (!title || !body) { const e = document.getElementById('err-an'); e.textContent = 'العنوان والتفاصيل مطلوبين'; e.style.display = 'block'; return; }
  btn.disabled = true;
  try { await store.createAnnouncement(title, body); closeModal(); toast('تم نشر الإعلان'); showServices(); }
  catch (err) { toast(store.humanError(err), true); }
  finally { btn.disabled = false; }
}

async function reviewRequest(el) {
  await store.reviewServiceRequest(el.dataset.id, el.dataset.status);
  toast(el.dataset.status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب');
  showServices();
}

async function attendance(el) {
  await store.markAttendance(el.dataset.kind);
  toast(el.dataset.kind === 'in' ? 'تم تسجيل حضورك' : 'تم تسجيل انصرافك');
  showServices();
}

export const actions = {
  'new-service-request': () => openRequestModal(),
  'submit-service-request': (el) => submitRequest(el),
  'review-request': (el) => reviewRequest(el),
  attendance: (el) => attendance(el),
  'new-announcement': () => openAnnouncementModal(),
  'submit-announcement': (el) => submitAnnouncement(el),
};
