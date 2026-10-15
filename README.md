# 图提取 / ImageGrab

一键提取 **淘宝 / 天猫、京东、拼多多商家版** 商品详情页所有图片，集中预览、自由勾选，并批量下载为 PNG 的 Chrome 浏览器扩展。

## 功能特性

- **一键提取**：自动扫描页面所有商品图，兼容 `srcset`、`data-src`、`data-lazy-src`、`data-ks-lazyload`、背景图等懒加载方式。
- **智能过滤**：自动排除图标、Logo、占位图与 1×1 像素图，只保留真正的商品图。
- **集中预览**：新标签页网格化展示所有图片，显示缩略图与尺寸。
- **自由勾选**：支持全选 / 反选 / 按需勾选。
- **统一 PNG**：JPG、WebP 自动经 canvas 转为 PNG（跨域图在 Service Worker 中通过 `fetch + createImageBitmap` 处理）。
- **批量下载**：文件名自动编号（`商品图_001.png`），带进度提示与结果反馈。

## 项目结构

```
项目根目录/
├── manifest.json      # 插件配置（Manifest V3）
├── content.js         # 注入按钮 + 提取图片
├── content.css        # 按钮样式
├── background.js      # Service Worker：下载与消息转发
├── gallery.html       # 预览页
├── gallery.js         # 预览页交互
├── gallery.css        # 预览页样式
├── docs/              # 官方宣传网站（纯静态）
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js
└── README.md
```

## 安装步骤

1. 下载本插件压缩包并解压到本地文件夹（例如 `D:\imagegrab`）。
2. 打开 Chrome，地址栏输入 `chrome://extensions` 回车。
3. 打开右上角的「开发者模式」开关。
4. 点击「加载已解压的扩展程序」，选择刚解压出来的**插件根目录**（包含 `manifest.json` 的那一层）即可。

> 注意：必须选择包含 `manifest.json` 的根目录，而不是 `docs` 目录。

## 使用方法

1. 打开淘宝 / 天猫、京东、拼多多商家版的**商品详情页**。
2. 页面右下角会出现「获取图片」悬浮按钮，点击即可提取。
3. 自动跳转到预览页，勾选需要的图片。
4. 点击「下载选中」，图片将统一转为 PNG 并保存到浏览器默认下载目录。

## 域名与权限说明

`manifest.json` 中声明了以下 `host_permissions`：

- 淘宝：`*://*.taobao.com/*`、`*://*.tmall.com/*`
- 京东：`*://*.jd.com/*`
- 拼多多商家版：`*://*.pinduoduo.com/*`、`*://*.yangkeduo.com/*`
- 常用图片 CDN：`alicdn.com`、`taobaocdn.com`、`360buyimg.com`、`pddpic.com`

若遇到某些图片 CDN 未在权限列表内导致下载失败，可在 `manifest.json` 的 `host_permissions` 中补充对应域名，然后到 `chrome://extensions` 点击「重新加载」。

## 官网预览说明

官网位于 `docs/` 目录，纯静态、无构建工具、无外部依赖：

- **打开方式**：直接双击 `docs/index.html`，或将其拖入 Chrome 窗口即可。
- **修改主色调**：打开 `docs/css/style.css`，在 `:root` 中修改 `--primary`、`--primary-2` 两个变量即可全局换肤。
- **修改文案**：文案集中在 `docs/index.html`，直接编辑对应区块的文字即可。
- **交互**：滚动吸顶导航、当前区块高亮、移动端汉堡菜单、滚动淡入动画均由 `docs/js/main.js` 提供。

## 常见问题

- **预览页提示「未检测到商品图片」**：确认当前处于商品详情页；部分平台图片在滚动后才懒加载，可先滚动页面让图片加载后再点击「获取图片」。
- **下载失败**：多为图片 CDN 域名缺少权限，按上文「域名与权限说明」补充 `host_permissions` 后重试。

## 许可证

MIT License（GitHub 链接占位，可自行替换 `docs/index.html` 底部 Footer 中的链接）。
