// ============ الوضع الداكن/الفاتح وثيمات الألوان ============
import { openModal, closeModal, toast } from './ui.js';
import { toggleLanguage, translateDOM, getLanguage, t } from './i18n.js';

const MODES = ['dark', 'light'];
const THEMES = ['gold', 'emerald', 'violet', 'blue', 'rose'];
let mode = localStorage.getItem('najran-mode') || 'dark';
let theme = localStorage.getItem('najran-theme') || 'gold';

export function applyPreferences() {
  if (!MODES.includes(mode)) mode = 'dark';
  if (!THEMES.includes(theme)) theme = 'gold';
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.mode-icon').forEach((icon) => {
    icon.className = `fi mode-icon ${mode === 'dark' ? 'fi-rr-moon' : 'fi-rr-sun'}`;
  });
  translateDOM(document.body);
}

function setMode(next) {
  mode = next; localStorage.setItem('najran-mode', mode); applyPreferences();
}
function setTheme(next) {
  if (!THEMES.includes(next)) return;
  theme = next; localStorage.setItem('najran-theme', theme); applyPreferences();
  toast(t('تم تغيير ألوان النظام'));
}

function openAppearance() {
  openModal(`
    <div class="modal-title-icon"><i class="fi fi-rr-palette"></i></div><h3>تخصيص المظهر</h3>
    <div class="preference-section"><label>الوضع</label><div class="mode-options"><button class="mode-card ${mode === 'dark' ? 'selected' : ''}" data-action="set-mode" data-mode="dark"><i class="fi fi-rr-moon"></i><span>داكن</span></button><button class="mode-card ${mode === 'light' ? 'selected' : ''}" data-action="set-mode" data-mode="light"><i class="fi fi-rr-sun"></i><span>فاتح</span></button></div></div>
    <div class="preference-section"><label>الألوان</label><div class="theme-options">${THEMES.map((x) => `<button class="theme-dot ${x} ${theme === x ? 'selected' : ''}" data-action="set-theme" data-theme="${x}" title="${x}"></button>`).join('')}</div></div>
    <div class="preference-section preference-language"><label>اللغة</label><button class="btn ghost" data-action="lang-toggle"><i class="fi fi-rr-language"></i>${getLanguage() === 'ar' ? 'English' : 'العربية'}</button></div>
    <div class="modal-actions"><button class="btn" data-action="close-modal">إغلاق</button></div>
  `);
  translateDOM(document.querySelector('body > .overlay'));
}

export const actions = {
  'theme-toggle': () => setMode(mode === 'dark' ? 'light' : 'dark'),
  'appearance-menu': () => openAppearance(),
  'set-mode': (el) => { setMode(el.dataset.mode); closeModal(); openAppearance(); },
  'set-theme': (el) => { setTheme(el.dataset.theme); closeModal(); openAppearance(); },
  'lang-toggle': () => { toggleLanguage(); closeModal(); },
};
