// ============ التواصل: شات عام، خاص، وإعلانات الإدارة ============
import { state, esc } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import { t, getLanguage, translateDOM } from '../i18n.js';
import * as store from '../store.js';

const canAnnounce = () => state.currentUser.permissions.includes('team') || state.currentUser.permissions.includes('settings');

export async function showChat() {
  loading('جاري فتح مساحة التواصل...');
  try {
    if (!state.roles.length) await store.loadRoles().catch(() => {});
    await Promise.all([store.loadEmployees(), store.loadAnnouncements()]);
  } catch (err) {
    errorState('تعذر فتح التواصل', store.humanError(err)); return;
  }
  renderChat();
  store.subscribePresence(() => { if (state.currentPage === 'chat') renderChat(); }, () => {});
}

const isOnline = (id) => state.presence?.[id]?.online === true;

function contactRow(employee) {
  const online = isOnline(employee.id);
  return `<button class="contact ${employee.id === state.activeChatUser ? 'active' : ''}" data-action="select-chat-user" data-id="${esc(employee.id)}">
    <span class="contact-avatar ${online ? 'is-online' : ''}">${esc((employee.name || '؟')[0])}</span>
    <span class="contact-copy"><strong>${esc(employee.name)}</strong><small>${esc(employee.roleLabel || '')}</small></span>
    <span class="contact-state ${online ? 'on' : ''}">${online ? 'متصل' : 'غير متصل'}</span>
  </button>`;
}

// العمود الثالث: تفاصيل المحادثة — أعضاء، حالة اتصال، وأرقام حقيقية
function detailsPanel(active) {
  const team = state.employees.filter((e) => !e.isAccessAccount);
  const onlineCount = team.filter((e) => isOnline(e.id)).length;

  if (state.chatTab === 'announcements') {
    const latest = state.announcements[0];
    return `<aside class="chat-details">
      <div class="details-hero"><span class="details-avatar admin"><i class="fi fi-rr-megaphone"></i></span><strong>إعلانات الشركة</strong><small>رسائل رسمية من الإدارة</small></div>
      <div class="details-stats">
        <article><span>${state.announcements.length}</span><small>إعلان</small></article>
        <article><span>${team.length}</span><small>مستلم</small></article>
      </div>
      ${latest ? `<div class="details-block"><h4>آخر إعلان</h4><div class="details-note"><strong>${esc(latest.title)}</strong><p>${esc(latest.body)}</p></div></div>` : ''}
    </aside>`;
  }

  if (active) {
    return `<aside class="chat-details">
      <div class="details-hero"><span class="details-avatar ${isOnline(active.id) ? 'is-online' : ''}">${esc((active.name || '؟')[0])}</span><strong>${esc(active.name)}</strong><small>${esc(active.roleLabel || '')}</small></div>
      <div class="details-stats">
        <article><span class="${isOnline(active.id) ? 'ok' : ''}">${isOnline(active.id) ? 'متصل' : 'غير متصل'}</span><small>الحالة</small></article>
        <article><span class="mono">@${esc(active.username || '—')}</span><small>اسم المستخدم</small></article>
      </div>
      <div class="details-block"><h4>خصوصية</h4><div class="details-note"><p>هاي محادثة بينك وبين ${esc(active.name)} بس — ما بيشوفها حدا تاني من الفريق.</p></div></div>
    </aside>`;
  }

  return `<aside class="chat-details">
    <div class="details-hero"><span class="details-avatar admin"><i class="fi fi-rr-users-alt"></i></span><strong>القناة العامة</strong><small>كل الفريق</small></div>
    <div class="details-stats">
      <article><span>${team.length}</span><small>عضو</small></article>
      <article><span class="ok">${onlineCount}</span><small>متصل الآن</small></article>
    </div>
    <div class="details-block"><h4>الأعضاء</h4><div class="details-members">${team.map((e) => `
      <div class="details-member"><span class="${isOnline(e.id) ? 'is-online' : ''}">${esc((e.name || '؟')[0])}</span><div><strong>${esc(e.name)}</strong><small>${esc(e.roleLabel || '')}</small></div></div>`).join('')}</div></div>
  </aside>`;
}

function renderChat() {
  store.stopChatListener();
  const query = (state.chatSearch || '').trim().toLowerCase();
  const contacts = state.employees
    .filter((e) => e.id !== state.currentUser.id)
    .filter((e) => !query || (e.name || '').toLowerCase().includes(query) || (e.username || '').toLowerCase().includes(query));
  const active = state.employees.find((e) => e.id === state.activeChatUser);

  render(`
    <div class="communication-head">
      <div><span class="section-kicker"><i class="fi fi-rr-comments"></i> مساحة الفريق</span><h1>التواصل الداخلي</h1><p>محادثات الفريق والإعلانات الرسمية في مكان واحد.</p></div>
      ${canAnnounce() ? `<button class="btn" data-action="chat-new-announcement"><i class="fi fi-rr-megaphone"></i> إعلان إداري جديد</button>` : ''}
    </div>
    <div class="chat-shell">
      <aside class="chat-sidebar">
        <div class="chat-tabs">
          <button class="${state.chatTab === 'general' ? 'active' : ''}" data-action="chat-tab" data-tab="general"><i class="fi fi-rr-users-alt"></i><span>عام</span></button>
          <button class="${state.chatTab === 'private' ? 'active' : ''}" data-action="chat-tab" data-tab="private"><i class="fi fi-rr-user"></i><span>خاص</span></button>
          <button class="${state.chatTab === 'announcements' ? 'active' : ''}" data-action="chat-tab" data-tab="announcements"><i class="fi fi-rr-megaphone"></i><span>الإعلانات</span></button>
        </div>
        ${state.chatTab === 'private' ? `
          <div class="contact-search"><i class="fi fi-rr-search"></i><input id="chat-contact-search" value="${esc(state.chatSearch || '')}" placeholder="ابحث عن زميل..." data-action="chat-search"></div>
          <div class="contact-list">
            <div class="contact-title">رسائل الفريق <b>${contacts.length}</b></div>
            ${contacts.length ? contacts.map(contactRow).join('') : '<div class="soft-empty small"><span>ما في نتائج</span></div>'}
          </div>`
        : `<div class="chat-info"><i class="fi ${state.chatTab === 'announcements' ? 'fi-rr-megaphone' : 'fi-rr-comments'}"></i><strong>${state.chatTab === 'announcements' ? 'إعلانات الشركة' : 'الدردشة العامة'}</strong><p>${state.chatTab === 'announcements' ? 'قرارات وأخبار رسمية من الإدارة لكل الموظفين.' : 'مساحة مشتركة لكل أعضاء الفريق.'}</p></div>`}
      </aside>
      <main class="chat-main">
        ${state.chatTab === 'announcements' ? renderAnnouncements() : state.chatTab === 'private' && !active ? `<div class="chat-placeholder"><i class="fi fi-rr-comments"></i><strong>اختر موظفاً لبدء المحادثة</strong><span>المحادثة خاصة بينكما فقط.</span></div>` : renderConversationHeader(active)}
      </main>
      ${detailsPanel(state.chatTab === 'private' ? active : null)}
    </div>
  `);

  if (state.chatTab === 'general') store.subscribeGeneralChat(renderMessages, renderChatError);
  else if (state.chatTab === 'private' && active) store.subscribePrivateChat(active.id, renderMessages, renderChatError);
}

function renderConversationHeader(active) {
  const title = active ? active.name : t('الدردشة العامة');
  const subtitle = active ? active.roleLabel : 'كل الموظفين يقدروا يشوفوا الرسائل هنا';
  return `<div class="conversation"><div class="conversation-head"><div class="contact-avatar large">${esc((title || '؟')[0])}</div><div><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><span class="secure-chat"><i class="fi fi-rr-shield-check"></i>${active ? 'محادثة خاصة' : 'قناة عامة'}</span></div><div class="message-list" id="message-list"><div class="message-loading"><i class="fi fi-rr-spinner"></i></div></div><div class="message-compose"><textarea id="chat-message" rows="1" maxlength="2000" placeholder="اكتب رسالة..."></textarea><button data-action="send-chat-message" aria-label="إرسال"><i class="fi fi-rr-paper-plane"></i></button></div></div>`;
}

function renderMessages(messages) {
  const box = document.getElementById('message-list');
  if (!box || state.currentPage !== 'chat') return;
  box.innerHTML = messages.length ? messages.map((m) => {
    const mine = m.senderId === state.currentUser.id;
    const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString(getLanguage() === 'en' ? 'en-US' : 'ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="message-row ${mine ? 'mine' : ''}">${mine ? '' : `<span class="message-avatar">${esc((m.senderName || '؟')[0])}</span>`}<div class="message-wrap">${mine ? '' : `<small class="message-sender">${esc(m.senderName)}</small>`}<div class="message-bubble">${esc(m.text)}</div><small class="message-time">${esc(time)}</small></div></div>`;
  }).join('') : `<div class="chat-placeholder compact"><i class="fi fi-rr-comment-alt"></i><strong>لا توجد رسائل بعد</strong><span>ابدأ المحادثة الآن</span></div>`;
  translateDOM(box);
  box.scrollTop = box.scrollHeight;
}

function renderChatError() {
  const box = document.getElementById('message-list');
  if (!box) return;
  box.innerHTML = `<div class="chat-placeholder compact"><i class="fi fi-rr-triangle-warning"></i><strong>الدردشة غير متاحة حالياً</strong><span>يرجى مراجعة مدير النظام.</span></div>`;
  translateDOM(box);
}

function renderAnnouncements() {
  const locale = getLanguage() === 'en' ? 'en-US' : 'ar-SA';
  return `<div class="announcement-page"><div class="conversation-head"><div class="contact-avatar large admin"><i class="fi fi-rr-megaphone"></i></div><div><strong>إعلانات الشركة</strong><small>الرسائل الرسمية من الإدارة</small></div>${canAnnounce() ? `<button class="icon-round announce-add" data-action="chat-new-announcement"><i class="fi fi-rr-plus"></i></button>` : ''}</div><div class="announcement-feed">${state.announcements.length ? state.announcements.map((a, i) => `<article class="announcement-post ${i === 0 ? 'latest' : ''}"><div class="announcement-mark"><i class="fi fi-rr-megaphone"></i></div><div><span class="announcement-meta">${i === 0 ? `${t('جديد')} · ` : ''}${a.createdAt ? new Date(a.createdAt).toLocaleDateString(locale, { dateStyle: 'long' }) : ''}</span><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></div></article>`).join('') : `<div class="chat-placeholder"><i class="fi fi-rr-megaphone"></i><strong>لا توجد إعلانات بعد</strong></div>`}</div></div>`;
}

async function sendMessage(btn) {
  const input = document.getElementById('chat-message');
  const text = input?.value.trim(); if (!text) return;
  btn.disabled = true;
  try { await store.sendChatMessage(state.chatTab, text, state.activeChatUser); input.value = ''; input.focus(); }
  catch (err) { toast(store.humanError(err), true); }
  finally { btn.disabled = false; }
}

function openAnnouncementModal() {
  openModal(`<div class="modal-title-icon"><i class="fi fi-rr-megaphone"></i></div><h3>إعلان إداري جديد</h3><div class="field"><label>العنوان *</label><input id="chat-an-title" placeholder="عنوان الإعلان"></div><div class="field"><label>التفاصيل *</label><textarea id="chat-an-body" rows="5" placeholder="اكتب الإعلان للموظفين..."></textarea><div class="err" id="chat-an-error"></div></div><div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="chat-submit-announcement">نشر الإعلان</button></div>`);
}

async function submitAnnouncement(btn) {
  const title = document.getElementById('chat-an-title').value.trim();
  const body = document.getElementById('chat-an-body').value.trim();
  if (!title || !body) { const e = document.getElementById('chat-an-error'); e.textContent = t('العنوان والتفاصيل مطلوبان'); e.style.display = 'block'; return; }
  btn.disabled = true;
  try { await store.createAnnouncement(title, body); closeModal(); state.chatTab = 'announcements'; toast(t('تم نشر الإعلان للموظفين')); showChat(); }
  catch (err) { toast(store.humanError(err), true); }
  finally { btn.disabled = false; }
}

export const actions = {
  'chat-tab': (el) => { state.chatTab = el.dataset.tab; state.chatSearch = ''; renderChat(); },
  'chat-search': (el) => {
    state.chatSearch = el.value;
    const list = document.querySelector('.contact-list');
    if (!list) return;
    const query = el.value.trim().toLowerCase();
    const contacts = state.employees
      .filter((e) => e.id !== state.currentUser.id)
      .filter((e) => !query || (e.name || '').toLowerCase().includes(query) || (e.username || '').toLowerCase().includes(query));
    list.innerHTML = `<div class="contact-title">رسائل الفريق <b>${contacts.length}</b></div>`
      + (contacts.length ? contacts.map(contactRow).join('') : '<div class="soft-empty small"><span>ما في نتائج</span></div>');
  },
  'select-chat-user': (el) => { state.activeChatUser = el.dataset.id; state.chatTab = 'private'; renderChat(); },
  'send-chat-message': (el) => sendMessage(el),
  'chat-new-announcement': () => openAnnouncementModal(),
  'chat-submit-announcement': (el) => submitAnnouncement(el),
};
