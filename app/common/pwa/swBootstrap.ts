// Service Worker 的注册脚本以内联形式写进静态 index.html 的 <head>，在应用 bundle 之前执行。
//
// 刻意不放在 React 组件的 effect 里：SPA 模式下根组件要等首屏路由的 clientLoader 全部结算
// 才会挂载，只要某个 /api 请求卡住、报错或被 ErrorBoundary 接住，注册代码就永远跑不到，
// 设备上也就一直没有 Service Worker —— 表现正是「断网后整页白屏」。内联脚本没有这些前置条件：
// 只要 HTML 到过浏览器，注册就一定发生。iOS 把桌面 PWA 当独立的存储分区，首次以独立窗口
// 打开时必须联网跑一遍这段脚本，之后才具备离线能力。
export const SW_BOOTSTRAP_SCRIPT = [
	"(function(){",
	"if(!('serviceWorker' in navigator))return;",
	"var sw=navigator.serviceWorker,reloading=false,hadController=!!sw.controller;",
	// 新版本接管后立刻整页重载：旧页面继续引用已被清掉的懒加载 chunk，离线时会直接失败
	"function onControllerChange(){if(reloading)return;reloading=true;window.location.reload();}",
	"function register(){",
	"sw.register('/sw.js',{scope:'/'}).then(function(reg){",
	"if(hadController)sw.addEventListener('controllerchange',onControllerChange);",
	"setInterval(function(){reg.update();},3600000);",
	"})['catch'](function(err){console.error('SW register failed:',err);});",
	"}",
	// 等 load 再注册，避免预缓存的 60 多个请求和首屏资源抢带宽
	"if(document.readyState==='complete'){register();}",
	"else{window.addEventListener('load',register,{once:true});}",
	"})();",
].join("");
