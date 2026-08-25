// ============ تسجيل الدخول باسم مستخدم، الإعداد الأول، الدخول المؤقت، والخروج ============
import { state, usernameProblem } from './state.js';
import { showScreen, buildSidebar, renderNotifPanel, go, toast, startLiveNotifications, stopLiveNotifications } from './ui.js';
import { t } from './i18n.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);

function setLoginError(boxId, msg) {
  const el = $(boxId);
  if (!el) return;
  if (msg) { el.textContent = t(msg); el.style.display = 'block'; } else { el.style.display = 'none'; }
}

const FORMS = ['normal', 'code', 'setup', 'loading'];
function showForm(which) {
  FORMS.forEach((f) => {
    const el = $(`login-form-${f}`);
    if (el) el.style.display = f === which ? 'block' : 'none';
  });
}

function setHeading(title, sub) {
  $('login-title').textContent = t(title);
  $('login-sub').textContent = t(sub);
}

const NORMAL_SUB = 'اسم المستخدم وكلمة السر يلي أعطاك ياهم المدير';

/* ---------- الشاشة ---------- */

// بيقرر يعرض فورم الدخول العادي ولا فورم "أنشئ حساب المدير الأول"
export async function showLogin() {
  showScreen('login');
  showForm('loading');
  setHeading('تسجيل الدخول', 'عم نتحقق من حالة النظام...');

  try {
    const fresh = await store.needsSetup();
    if (fresh) {
      setHeading('إعداد النظام لأول مرة', 'ما في حسابات بعد — أنشئ حساب المدير الأول');
      showForm('setup');
    } else {
      setHeading('تسجيل الدخول', NORMAL_SUB);
      showForm('normal');
    }
  } catch (err) {
    // لو ما قدرنا نوصل للقاعدة، منعرض الدخول العادي مع سبب واضح بدل شاشة فاضية
    setHeading('تسجيل الدخول', NORMAL_SUB);
    showForm('normal');
    setLoginError('login-err', store.connectionError(err));
  }
}

export function showCodeForm() {
  setHeading('دخول مؤقت', 'أدخل الرمز السري المشترك');
  setLoginError('code-err', '');
  showForm('code');
  $('login-code').focus();
}

export function showNormalForm() {
  setHeading('تسجيل الدخول', NORMAL_SUB);
  setLoginError('login-err', '');
  showForm('normal');
  $('login-username').focus();
}

/* ---------- الإعداد الأول ---------- */

export async function doFirstSetup(btn) {
  const name = $('setup-name').value.trim();
  const username = $('setup-username').value.trim().toLowerCase();
  const password = $('setup-password').value;
  const code = $('setup-code').value.trim();
  setLoginError('setup-err', '');

  if (!name) { setLoginError('setup-err', 'لازم تدخل اسمك'); return; }
  const uProblem = usernameProblem(username);
  if (uProblem) { setLoginError('setup-err', uProblem); return; }
  if (password.length < 6) { setLoginError('setup-err', 'كلمة السر 6 أحرف عالأقل'); return; }
  if (code && code.length < 6) { setLoginError('setup-err', 'رمز الدخول المؤقت 6 خانات عالأقل — أو اتركه فاضي لو ما بدك تفعّله'); return; }
  if (code && code === password) { setLoginError('setup-err', 'خلّي رمز الدخول المؤقت مختلف عن كلمة سرك'); return; }

  btn.disabled = true;
  btn.textContent = 'عم ننشئ الحساب...';
  try {
    await store.firstSetup(name, username, password, code || null);
    // onAuthStateChanged بيلتقط الجلسة الجديدة ويدخّلنا الداشبورد لحاله
  } catch (err) {
    setLoginError('setup-err', store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء حساب المدير';
  }
}

/* ---------- الدخول ---------- */

export async function doLogin(btn) {
  const username = $('login-username').value.trim().toLowerCase();
  const password = $('login-password').value;
  setLoginError('login-err', '');

  if (!username || !password) {
    setLoginError('login-err', 'لازم اسم مستخدم وكلمة سر');
    return;
  }

  btn.disabled = true;
    btn.textContent = t('عم ندخّلك...');
  try {
    await store.login(username, password);
  } catch (err) {
    setLoginError('login-err', store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = t('دخول');
  }
}

export async function doLoginWithCode(btn) {
  const code = $('login-code').value.trim();
  setLoginError('code-err', '');

  if (!code) { setLoginError('code-err', 'أدخل الرمز السري'); return; }

  btn.disabled = true;
    btn.textContent = t('عم ندخّلك...');
  try {
    await store.loginWithAccessCode(code);
  } catch (err) {
    // ما منفرّق بين "الرمز غلط" و"الدخول المؤقت موقوف" — الاثنين نفس الرسالة
    setLoginError('code-err', err?.code === 'auth/invalid-credential' || err?.code === 'auth/user-not-found'
      ? 'الرمز غلط أو الدخول المؤقت موقوف'
      : store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = t('دخول');
  }
}

export async function doLogout() {
  stopLiveNotifications();
  await store.logoutUser().catch(() => {});
  state.currentUser = null;
  state.employees = [];
  state.clients = [];
  state.tasks = [];
  state.content = {};
  state.finance = {};
  state.liveNotifications = [];
  state.presence = {};
  showLogin();
}

/* ---------- بعد نجاح الدخول ---------- */

// بينده لما Firebase يتأكد من الجلسة (سواء دخول جديد أو جلسة محفوظة من قبل)
export async function onSignedIn(user) {
  showScreen('login');
  showForm('loading');
  setHeading('أهلاً فيك', 'عم نجهّز لوحتك...');

  try {
    const profile = await store.loadProfile(user.uid);
    if (!profile) {
      await store.logoutUser().catch(() => {});
      setHeading('تسجيل الدخول', NORMAL_SUB);
      showForm('normal');
      setLoginError('login-err', 'حسابك موجود بس مو مربوط بموظف — راجع المدير');
      return;
    }
    state.currentUser = profile;
    store.startPresence();
    await store.loadRoles().catch(() => {});
    await store.loadEmployees().catch(() => {});
    await store.loadTasks().catch(() => {});

    showScreen('dashboard');
    buildSidebar();
    renderNotifPanel();
    startLiveNotifications();
    if (profile.isAccessAccount) toast('إنت داخل بالرمز المؤقت — صلاحيات محدودة');
    go(profile.permissions.includes('home') ? 'home' : profile.permissions[0]);
  } catch (err) {
    await store.logoutUser().catch(() => {});
    setHeading('تسجيل الدخول', NORMAL_SUB);
    showForm('normal');
    setLoginError('login-err', store.humanError(err));
  }
}
