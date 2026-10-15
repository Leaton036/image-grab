/**
 * 图提取 / ImageGrab —— 后台 Service Worker（Manifest V3）
 *
 * 职责：
 *  1. 接收内容脚本发来的图片列表，存储后打开 gallery.html 预览页；
 *  2. 接收预览页发来的「下载选中」请求，逐张通过 fetch + createImageBitmap
 *     转换为 PNG（规避跨域限制），再调用 chrome.downloads.download 保存；
 *  3. 向预览页广播下载进度与完成结果。
 */

'use strict';

// 存储待展示图片列表的 key
var IMAGE_STORAGE_KEY = 'imageGrabPendingImages';

/* ---------------------------------------------------------------
 * 消息监听
 * --------------------------------------------------------------- */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'OPEN_GALLERY') {
    handleOpenGallery(message.images || [])
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });
    return true; // 返回 true 表示异步响应
  }

  if (message && message.type === 'DOWNLOAD_IMAGES') {
    handleDownload(message.urls || [])
      .then(function (result) { sendResponse(result); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });
    return true;
  }

  return false;
});

/* ---------------------------------------------------------------
 * 打开预览页：先存数据，再复用已打开标签（避免重复开一堆标签）
 * --------------------------------------------------------------- */
async function handleOpenGallery(images) {
  await chrome.storage.local.set({ [IMAGE_STORAGE_KEY]: images });

  var galleryUrl = chrome.runtime.getURL('gallery.html');
  var tabs = await chrome.tabs.query({ url: galleryUrl });

  if (tabs.length > 0) {
    // 已有预览页 → 切到该标签并刷新，以读取新数据
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.tabs.reload(tabs[0].id);
  } else {
    await chrome.tabs.create({ url: galleryUrl });
  }
}

/* ---------------------------------------------------------------
 * 批量下载：逐张转换 PNG 并保存
 * --------------------------------------------------------------- */
async function handleDownload(urls) {
  var success = [];
  var failed = [];

  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    broadcast({
      type: 'DOWNLOAD_PROGRESS',
      current: i + 1,
      total: urls.length,
      url: url
    });

    try {
      var pngDataUrl = await convertToPngDataUrl(url);
      // 文件名：商品图_001.png（序号补零）
      var filename = '商品图_' + padZero(i + 1, 3) + '.png';
      var downloadId = await chrome.downloads.download({
        url: pngDataUrl,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
      success.push({ url: url, id: downloadId });
    } catch (err) {
      failed.push({ url: url, error: String(err && err.message || err) });
    }
  }

  broadcast({ type: 'DOWNLOAD_DONE', success: success, failed: failed });
  return { ok: true, success: success, failed: failed };
}

/**
 * 下载一张图片并转换为 PNG DataURL。
 * 在 Service Worker 中通过 fetch（配合 host_permissions 可跨域）+ createImageBitmap
 * + OffscreenCanvas 完成，从而规避页面 canvas 的跨域污染问题。
 */
async function convertToPngDataUrl(url) {
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  var blob = await resp.blob();

  var bitmap = await createImageBitmap(blob);

  var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  var ctx = canvas.getContext('2d');
  // 铺白底：避免透明 PNG 转出黑底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);

  var pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToDataUrl(pngBlob);
}

/**
 * Blob → DataURL（FileReader 在 Service Worker 中可用）
 */
function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

/**
 * 数字补零
 */
function padZero(num, len) {
  var s = String(num);
  while (s.length < len) s = '0' + s;
  return s;
}

/**
 * 向扩展内其它页面（gallery.html）广播消息。
 * 从 Service Worker 调用 chrome.runtime.sendMessage 会广播给除自身外的扩展上下文。
 */
function broadcast(msg) {
  try {
    chrome.runtime.sendMessage(msg).catch(function () { /* 忽略无接收方错误 */ });
  } catch (e) { /* 忽略 */ }
}
