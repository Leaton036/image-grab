/**
 * 图提取 / ImageGrab —— 预览页交互逻辑
 *
 * 职责：
 *  1. 读取后台写入 storage 的图片列表并网格化展示；
 *  2. 支持单张勾选、全选、反选、已选数量统计；
 *  3. 点击「下载选中」后请求后台批量下载 PNG，并展示进度与结果反馈。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'imageGrabPendingImages';

  // DOM 引用
  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var totalEl = document.getElementById('total');
  var selectedCount = document.getElementById('selectedCount');
  var downloadBtn = document.getElementById('download');
  var selectAllBtn = document.getElementById('selectAll');
  var invertBtn = document.getElementById('invert');
  var progressEl = document.getElementById('progress');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var toastEl = document.getElementById('toast');

  var items = []; // 每项：{ url, card, checkbox }

  /* ---------------------------------------------------------------
   * 初始化：读取数据并渲染
   * --------------------------------------------------------------- */
  async function init() {
    var data = await chrome.storage.local.get(STORAGE_KEY);
    var images = data[STORAGE_KEY] || [];

    if (!images.length) {
      empty.classList.remove('hidden');
      totalEl.textContent = '';
      return;
    }

    totalEl.textContent = '共 ' + images.length + ' 张';
    render(images);
  }

  /* ---------------------------------------------------------------
   * 渲染网格
   * --------------------------------------------------------------- */
  function render(images) {
    grid.innerHTML = '';
    items = [];

    images.forEach(function (img, idx) {
      var card = document.createElement('div');
      card.className = 'card';

      var num = padZero(idx + 1, 3);
      card.innerHTML =
        '<label class="card-check">' +
          '<input type="checkbox" class="cb" />' +
          '<span class="checkmark"></span>' +
        '</label>' +
        '<div class="thumb">' +
          '<img alt="商品图 ' + num + '" loading="lazy" referrerpolicy="no-referrer" />' +
        '</div>' +
        '<div class="meta">' +
          '<span class="index">#' + num + '</span>' +
          '<span class="size"></span>' +
        '</div>';

      var checkbox = card.querySelector('.cb');
      var imgEl = card.querySelector('.thumb img');
      var sizeEl = card.querySelector('.size');

      imgEl.src = img.url;
      imgEl.onload = function () {
        sizeEl.textContent = imgEl.naturalWidth + ' × ' + imgEl.naturalHeight;
      };
      imgEl.onerror = function () {
        card.classList.add('error');
        sizeEl.textContent = '加载失败';
      };

      // 点击卡片任意位置即可勾选
      card.addEventListener('click', function (e) {
        if (e.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        updateCount();
      });

      checkbox.addEventListener('change', updateCount);

      grid.appendChild(card);
      items.push({ url: img.url, card: card, checkbox: checkbox });
    });

    updateCount();
  }

  /* ---------------------------------------------------------------
   * 已选数量统计
   * --------------------------------------------------------------- */
  function updateCount() {
    var n = items.filter(function (it) { return it.checkbox.checked; }).length;
    selectedCount.textContent = '已选 ' + n + ' 张';
    downloadBtn.disabled = n === 0;
  }

  /* ---------------------------------------------------------------
   * 全选 / 反选
   * --------------------------------------------------------------- */
  selectAllBtn.addEventListener('click', function () {
    items.forEach(function (it) { it.checkbox.checked = true; });
    updateCount();
  });

  invertBtn.addEventListener('click', function () {
    items.forEach(function (it) { it.checkbox.checked = !it.checkbox.checked; });
    updateCount();
  });

  /* ---------------------------------------------------------------
   * 下载选中
   * --------------------------------------------------------------- */
  downloadBtn.addEventListener('click', async function () {
    var urls = items
      .filter(function (it) { return it.checkbox.checked; })
      .map(function (it) { return it.url; });

    if (!urls.length) return;

    downloadBtn.disabled = true;
    showProgress();

    try {
      var result = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', urls: urls });
      if (result && result.success) {
        var okCount = result.success.length;
        var failCount = result.failed ? result.failed.length : 0;
        var msg = '下载完成：成功 ' + okCount + ' 张';
        if (failCount > 0) msg += '，失败 ' + failCount + ' 张';
        showToast(msg);
      } else {
        showToast('下载失败：' + (result && result.error ? result.error : '未知错误'));
      }
    } catch (e) {
      showToast('请求下载失败：' + e.message);
    } finally {
      hideProgress();
      downloadBtn.disabled = false;
    }
  });

  /* ---------------------------------------------------------------
   * 监听后台广播的下载进度
   * --------------------------------------------------------------- */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === 'DOWNLOAD_PROGRESS') {
      updateProgress(msg.current, msg.total);
    }
    if (msg.type === 'DOWNLOAD_DONE') {
      hideProgress();
    }
  });

  /* ---------------------------------------------------------------
   * UI 辅助
   * --------------------------------------------------------------- */
  function showProgress() {
    progressEl.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '';
  }

  function hideProgress() {
    progressEl.classList.add('hidden');
  }

  function updateProgress(current, total) {
    var pct = total ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = '正在下载并转换为 PNG：' + current + ' / ' + total;
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function padZero(num, len) {
    var s = String(num);
    while (s.length < len) s = '0' + s;
    return s;
  }

  init();
})();
