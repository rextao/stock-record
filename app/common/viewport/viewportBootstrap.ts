/**
 * 视口与显示模式的唯一探测入口。
 *
 * 移动端适配之所以碎，是因为 CSS 侧能拿到的信号都不完整：
 * 1. `100vh` 是「工具栏收起」的大视口，`100dvh` 只跟随工具栏、**不跟随软键盘**；
 *    iOS 弹出键盘时只有 visualViewport 会变，dvh 和 position:fixed 都原地不动，
 *    于是在流内或 fixed 在底部的操作栏会被键盘整条推到屏幕外（表现就是「按钮根本没出现」）。
 * 2. `@media (display-mode: standalone)` 在 iOS 上不可靠 —— 通过旧式
 *    `apple-mobile-web-app-capable` 从桌面启动时，这条查询可能仍然命中 browser，
 *    只有 `navigator.standalone` 是准的。命中失败就意味着底部安全区不补偿，
 *    home indicator 那一条露出 body 底色（深色下就是一条黑条）。
 *
 * 所以这里用 JS 一次性把真值写到 <html> 上，CSS 只消费结果：
 * - `data-display-mode`  standalone | browser
 * - `--app-viewport-height` / `--app-viewport-top`  可视视口的精确矩形
 * - `--app-keyboard-inset` 键盘遮挡高度（需要单独抬升元素时用）
 *
 * 必须以内联同步脚本的形式放在 <head>：它决定首屏外壳尺寸，不能等 React 挂载。
 */
export const VIEWPORT_BOOTSTRAP_SCRIPT = `(function () {
  var root = document.documentElement;
  var standalone = false;
  try {
    standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
      navigator.standalone === true;
  } catch (e) {}
  root.setAttribute('data-display-mode', standalone ? 'standalone' : 'browser');

  var vv = window.visualViewport;
  function sync() {
    var height = vv ? vv.height : window.innerHeight;
    if (!height) return;
    var top = vv ? vv.offsetTop : 0;
    var keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--app-viewport-height', height + 'px');
    root.style.setProperty('--app-viewport-top', top + 'px');
    root.style.setProperty('--app-keyboard-inset', keyboard + 'px');
  }
  sync();
  if (vv) {
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
  }
  window.addEventListener('resize', sync);
  window.addEventListener('focusin', sync);
  window.addEventListener('focusout', function () { setTimeout(sync, 120); });
  window.addEventListener('orientationchange', function () { setTimeout(sync, 200); });
})();`;
