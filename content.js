/**
 * 图提取 / ImageGrab —— 内容脚本（Content Script）
 *
 * 职责：
 *  1. 在电商商品详情页右下角注入「获取图片」悬浮按钮；
 *  2. 点击后扫描页面中所有商品相关图片（含 <img>、srcset、懒加载属性、背景图）；
 *  3. 对图片 URL 补全为绝对地址、去重、过滤图标/占位图后，
 *     通过 chrome.runtime.sendMessage 交给后台（Service Worker）打开预览页。
 */
(function () {
  'use strict';

  // 防止在单页应用（SPA）中被重复注入
  if (window.__ImageGrabInjected__) return;
  window.__ImageGrabInjected__ = true;

  // 尺寸阈值：已知尺寸且小于该值的图片视为图标 / 1x1 占位图，直接过滤
  var MIN_SIZE = 100;

  // 明显的非商品图关键词（用于无法读取尺寸的背景图 / 懒加载图）
  var INVALID_KEYWORDS = [
    'placeholder', 'spacer', 'blank', '1x1', 'loading', 'sprite',
    'avatar', 'icon', 'logo', 'transparent', 'pixel', 's.gif',
    'pixel.gif', 'spacer.gif'
  ];

  /* ---------------------------------------------------------------
   * 工具函数
   * --------------------------------------------------------------- */

  /**
   * 将相对路径补全为绝对 URL
   */
  function toAbsolute(url) {
    if (!url) return '';
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return '';
    }
  }

  /**
   * 判断是否为明显无效的图片 URL（非 http/https，或命中关键词）
   */
  function isInvalidUrl(url) {
    if (!url) return true;
    if (!/^https?:\/\//i.test(url)) return true; // 仅保留 http / https
    var lower = url.toLowerCase();
    for (var i = 0; i < INVALID_KEYWORDS.length; i++) {
      if (lower.indexOf(INVALID_KEYWORDS[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * 解析 srcset 字符串，返回所有候选 URL（去掉后面的像素密度描述符）
   */
  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(',')
      .map(function (item) { return item.trim().split(/\s+/)[0]; })
      .filter(Boolean);
  }

  /* ---------------------------------------------------------------
   * 核心：提取图片
   * --------------------------------------------------------------- */

  function extractImages() {
    var seen = {}; // 用对象模拟 Set，便于兼容旧浏览器
    var result = [];

    /**
     * 将一条候选 URL 加入结果（去重 + 过滤 + 记录尺寸）
     */
    function addCandidate(rawUrl, width, height) {
      var abs = toAbsolute(rawUrl);
      if (!abs) return;
      if (seen[abs]) return;          // 去重
      if (isInvalidUrl(abs)) return;  // 过滤
      seen[abs] = true;
      result.push({ url: abs, width: width || 0, height: height || 0 });
    }

    /**
     * 处理单个属性值：可能是单个 URL、JSON 数组（部分站点懒加载存法）
     */
    function addFromValue(value, width, height) {
      if (!value) return;
      var v = String(value).trim();
      if (!v) return;

      // 兼容 JSON 数组形式，例如 data-src='["//img.xx.com/1.jpg","//img.xx.com/2.jpg"]'
      if (v.charAt(0) === '[') {
        try {
          var arr = JSON.parse(v);
          if (Array.isArray(arr)) {
            arr.forEach(function (u) {
              if (typeof u === 'string') addCandidate(u, width, height);
            });
            return;
          }
        } catch (e) { /* 解析失败则按普通字符串处理 */ }
      }
      addCandidate(v, width, height);
    }

    /* ---------- 1. 扫描 <img> 标签 ---------- */
    var imgs = document.querySelectorAll('img');
    imgs.forEach(function (img) {
      var w = img.naturalWidth || 0;
      var h = img.naturalHeight || 0;

      // 已知尺寸且过小 → 过滤（图标 / 1x1 占位图）
      if (w > 0 && h > 0 && (w < MIN_SIZE || h < MIN_SIZE)) return;

      // 兼容不同平台的懒加载属性
      var lazyAttrs = [
        'src',
        'data-src',
        'data-lazy-src',
        'data-original',
        'data-lazy',
        'data-ks-lazyload',  // 淘宝 / 天猫常用
        'data-img',
        'data-lazy-img',     // 京东常用
        'data-image',
        'data-url'
      ];

      lazyAttrs.forEach(function (attr) {
        var val = img.getAttribute(attr);
        if (val) addFromValue(val, w, h);
      });

      // srcset（含懒加载的 data-srcset）
      var srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
      if (srcset) {
        parseSrcset(srcset).forEach(function (u) { addCandidate(u, w, h); });
      }
    });

    /* ---------- 2. 扫描背景图（background-image） ---------- */
    // 背景图常以懒加载形式存在，先取内联样式，再取常见 data-* 属性
    var bgAttrs = ['data-bg', 'data-background', 'data-background-image', 'data-image-src', 'data-original'];
    var all = document.querySelectorAll('*');
    all.forEach(function (el) {
      // 内联 style.backgroundImage
      var inlineBg = el.style && el.style.backgroundImage;
      if (inlineBg && inlineBg !== 'none') {
        var match = inlineBg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match) addCandidate(match[1], 0, 0);
      }
      // data 属性形式的背景图
      bgAttrs.forEach(function (attr) {
        var val = el.getAttribute(attr);
        if (val) addFromValue(val, 0, 0);
      });
    });

    return result;
  }

  /* ---------------------------------------------------------------
   * 悬浮按钮
   * --------------------------------------------------------------- */

  function createButton() {
    if (document.getElementById('image-grab-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'image-grab-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="ig-icon"></span><span>获取图片</span>';
    btn.title = '图提取 / ImageGrab：提取本页所有商品图片';
    btn.addEventListener('click', onButtonClick);
    document.body.appendChild(btn);
  }

  function onButtonClick() {
    var images = extractImages();
    if (!images.length) {
      showToast('未检测到商品图片');
      return;
    }
    showToast('已提取 ' + images.length + ' 张图片，正在打开预览页…');
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_GALLERY', images: images }, function () {
        var err = chrome.runtime.lastError;
        if (err) showToast('打开预览页失败：' + err.message);
      });
    } catch (e) {
      showToast('发送消息失败：' + e.message);
    }
  }

  function showToast(text) {
    var toast = document.getElementById('image-grab-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'image-grab-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast.__t);
    toast.__t = setTimeout(function () { toast.classList.remove('show'); }, 2500);
  }

  /* ---------------------------------------------------------------
   * 是否商品详情页（按平台 URL 特征判断，避免在列表/首页出现按钮）
   * --------------------------------------------------------------- */
  function isProductPage() {
    var host = window.location.hostname;
    var href = window.location.href;

    // 淘宝 / 天猫
    if (host.indexOf('taobao.com') !== -1 || host.indexOf('tmall.com') !== -1) {
      return /item\.htm/i.test(href) ||
             /item\.taobao\.com/i.test(host) ||
             /detail\.tmall\.com/i.test(host);
    }
    // 京东
    if (host.indexOf('jd.com') !== -1) {
      return /item\.jd\.com/i.test(host) || /\/\d+\.html/i.test(href);
    }
    // 拼多多 / 拼多多商家版
    if (host.indexOf('pinduoduo.com') !== -1 || host.indexOf('yangkeduo.com') !== -1) {
      return /goods\.html/i.test(href) || /goods_id/i.test(href);
    }
    return false;
  }

  /* ---------------------------------------------------------------
   * 启动：仅在商品详情页注入按钮
   * --------------------------------------------------------------- */
  if (isProductPage()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createButton);
    } else {
      createButton();
    }
  }
})();
