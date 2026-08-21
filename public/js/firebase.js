// ============ الاتصال بـFirebase ============
// ملاحظة أمان: مفاتيح Firebase للويب **مو أسرار** — المفروض تكون ظاهرة بكود
// المتصفح. الحماية الحقيقية بتيجي من قواعد قاعدة البيانات (database.rules.json)
// ومن Firebase Authentication، مش من إخفاء المفتاح.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCUJjTmBAKfdYXYa8wrogDO6LENLEfnLl4',
  authDomain: 'najran-system.firebaseapp.com',
  databaseURL: 'https://najran-system-default-rtdb.firebaseio.com',
  projectId: 'najran-system',
  storageBucket: 'najran-system.firebasestorage.app',
  messagingSenderId: '391554052845',
  appId: '1:391554052845:web:cc51894593a9b1896ad2e4',
  measurementId: 'G-H82WEK3X6N',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// التحليلات اختيارية — بتفشل بمتصفحات معينة أو لما تفتح الملف محلياً، فما منوقف عليها
isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});
