/**
 * 图提取 / ImageGrab —— 官方宣传网站交互脚本
 *
 * 功能：
 *  1. 移动端汉堡菜单展开 / 收起；
 *  2. 导航栏滚动吸顶（毛玻璃 + 阴影）与当前区块高亮；
 *  3. 滚动进入视口时元素淡入上移动画（IntersectionObserver）；
 *  4. 锚点平滑滚动。
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 1. 移动端汉堡菜单
   * --------------------------------------------------------------- */
  var menuToggle = document.getElementById('menuToggle');
  var navLinks = document.getElementById('navLinks');

  menuToggle.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('open');
    menuToggle.classList.toggle('open', isOpen);
    menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // 点击导航链接后收起菜单（移动端）
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('open');
      menuToggle.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------------------------------------------------------------
   * 2. 导航栏吸顶阴影 + 当前区块高亮
   * --------------------------------------------------------------- */
  var navbar = document.getElementById('navbar');
  var sectionIds = ['intro', 'features', 'install', 'download'];

  function onScroll() {
    // 吸顶阴影
    navbar.classList.toggle('scrolled', window.scrollY > 10);
    highlightNav();
  }

  function highlightNav() {
    var pos = window.scrollY + 140;
    var current = sectionIds[0];

    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.offsetTop <= pos) current = id;
    });

    document.querySelectorAll('.nav-link').forEach(function (a) {
      var href = (a.getAttribute('href') || '').replace('#', '');
      a.classList.toggle('active', href === current);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', highlightNav, { passive: true });

  /* ---------------------------------------------------------------
   * 3. 滚动淡入动画（IntersectionObserver）
   * --------------------------------------------------------------- */
  var revealEls = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // 只触发一次
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(function (el) { observer.observe(el); });

  /* ---------------------------------------------------------------
   * 4. 锚点平滑滚动
   * （CSS 已启用 scroll-behavior: smooth，这里兜底处理）
   * --------------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 初始化一次
  onScroll();
})();
