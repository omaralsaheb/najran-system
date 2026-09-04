// ============ شاشة الانترو — الشعار بس، بألوان متدرجة متحركة ============
// ما في شريط تحميل عن قصد: الأنيميشن نفسه هو مؤشر إنه في شغل عم يصير.
// الشعار PNG، فمنستعمله كـmask ومنحط تحته تدرّج لوني متحرك — هيك الألوان
// بتمشي جوا شكل الشعار نفسه بدل ما تكون مربع فوقه.
import { LOGO_SRC } from './logo.js';

const MIN_VISIBLE_MS = 1100;   // أقل مدة ظهور — حتى ما ترمش الشاشة ويختفي فجأة
const HARD_TIMEOUT_MS = 7000;  // شبكة الأمان: لو Firebase ما رد أبداً، ما منترك المستخدم قدام شاشة عالقة

let shownAt = 0;
let hidden = false;
let failsafe = null;

export function initIntro() {
  const el = document.getElementById('intro-screen');
  const logo = document.getElementById('intro-logo');
  if (!el || !logo) return;

  // لازم القناع ينحط الأول؛ لولا هيك بيبان مستطيل التدرّج كامل لحظة
  logo.style.setProperty('--intro-logo', `url("${LOGO_SRC}")`);
  requestAnimationFrame(() => logo.classList.add('ready'));
  shownAt = Date.now();
  document.body.classList.add('intro-active');

  // لو صار خطأ بالشبكة أو ما وصل رد، الانترو بيختفي لحاله بدل ما يعلق
  failsafe = setTimeout(() => hideIntro(), HARD_TIMEOUT_MS);
}

export function hideIntro() {
  if (hidden) return;
  const el = document.getElementById('intro-screen');
  if (!el) return;

  const waited = Date.now() - shownAt;
  if (waited < MIN_VISIBLE_MS) {
    setTimeout(hideIntro, MIN_VISIBLE_MS - waited);
    return;
  }

  hidden = true;
  clearTimeout(failsafe);
  el.classList.add('intro-done');
  document.body.classList.remove('intro-active');
  // منشيله من الصفحة بعد ما تخلص حركة التلاشي
  setTimeout(() => el.remove(), 700);
}
