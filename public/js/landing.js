// ============ أنيميشن الصفحة الرئيسية (الشعار ثلاثي الأبعاد + الجزيئات) ============
import { LOGO_SRC } from './logo.js';

export function initLanding() {
  document.querySelectorAll('.logo-img').forEach((img) => { img.src = LOGO_SRC; });

  // طبقات متتالية بعمق مختلف — بتعطي إحساس إن الشعار مجسّم لما يدور
  const logo = document.getElementById('logo3d');
  const depth = 10;
  for (let i = depth; i >= 1; i--) {
    const layer = document.createElement('img');
    layer.src = LOGO_SRC;
    layer.className = 'mark';
    layer.style.filter = `brightness(${Math.max(0.15, 0.55 - i * 0.04)}) saturate(0.4)`;
    layer.style.transform = `translateZ(-${i * 2}px)`;
    logo.appendChild(layer);
  }
  const front = document.createElement('img');
  front.src = LOGO_SRC;
  front.className = 'mark';
  front.style.transform = 'translateZ(2px)';
  logo.appendChild(front);

  const scene = document.getElementById('scene');
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.bottom = '-10px';
    p.style.animationDuration = `${8 + Math.random() * 10}s`;
    p.style.animationDelay = `${Math.random() * 10}s`;
    scene.appendChild(p);
  }

  // ميلان خفيف يتبع الماوس
  const stage = document.getElementById('stage');
  let targetX = 0; let targetY = 0; let curX = 0; let curY = 0;
  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientY / window.innerHeight - 0.5) * -14;
    targetY = (e.clientX / window.innerWidth - 0.5) * 18;
  });
  (function tick() {
    curX += (targetX - curX) * 0.06;
    curY += (targetY - curY) * 0.06;
    stage.style.transform = `rotateX(${curX}deg) rotateY(${curY}deg)`;
    requestAnimationFrame(tick);
  }());
}
