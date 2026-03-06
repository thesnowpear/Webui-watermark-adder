# 开发说明文档

## 项目概述

这是一个为 **Stable Diffusion WebUI Forge** 开发的水印添加扩展。

**重要**: 必须安装在 WebUI Forge 的 `extensions` 目录下运行，不是独立应用。

## 开发环境

### 前置要求
- Python 3.8+
- Stable Diffusion WebUI Forge 已安装
- Pillow >= 9.0.0

### 开发模式
```bash
cd stable-diffusion-webui-forge/extensions/
ln -s /path/to/dev/sd-webui-watermark-adder ./
cd sd-webui-watermark-adder && python install.py
cd ../.. && python webui.py --listen --api
```

## 项目架构

### 文件结构
```
sd-webui-watermark-adder/
├── scripts/
│   └── watermark_adder.py          # 主扩展脚本
├── javascript/
│   └── watermark_canvas.js         # 前端 Canvas 交互
├── watermarks/
│   ├── images/                     # 图片水印存储
│   └── texts/                      # 文字水印配置 (JSON)
├── install.py                      # 依赖安装
└── *.md                            # 文档
```

### 核心组件

#### 1. watermark_adder.py（后端）

使用 `script_callbacks.on_ui_tabs()` 注册为顶级标签页。

**WatermarkManager 类**:
- `list_image_watermarks()` / `list_text_watermarks()`: 列出水印库
- `get_image_watermark_gallery()` / `get_text_watermark_gallery()`: Gallery 数据
- `apply_watermark_to_image(base_img, watermark_configs)`: 应用水印到图片
- `create_extractable_image(watermarked, original, path)`: 创建 Polyglot 文件
- 性能缓存：`_font_cache`（字号→ImageFont）、`_wm_img_cache`（路径→RGBA Image）

**水印大小**:
- 以像素为单位（非百分比）
- 文字水印：`size` 直接作为字号像素
- 图片水印：`size` = 最短边像素数，按比例缩放

**路径处理**:
- WebUI 根目录：`Path(__file__).parent.parent.parent.parent`（从 `extensions/ext-name/scripts/file.py` 上溯 4 级）
- `outputs/` 在 WebUI 根目录下，与 `extensions/` 同级

**Gradio File 兼容**:
- `_resolve_file_path(file_obj)`: 处理 str / obj.name / dict 三种类型
- `_resolve_orig_name(file_obj)`: 获取原始文件名

#### 2. watermark_canvas.js（前端）

**状态对象** `state`:
```javascript
{
    canvas, ctx, editorEl, imgEl,
    isHovering, mouseX, mouseY,
    selectedType, selectedData,
    watermarks: [],              // 已添加水印的预览列表
    size: 100, rotation: 0, opacity: 0.7,
    canvasReady: false,
    imgCache: {},                // 水印图片缓存: path -> Image
    zoom: 1, panX: 0, panY: 0,  // 缩放平移
    isDragging, hasDragged,      // 拖拽状态
    dragStartX, dragStartY, dragStartPanX, dragStartPanY,
}
```

**核心模块**:
- **Bridge 通信**: 通过隐藏 `#watermark_selected_bridge` Textbox 同步 Python→JS 的水印选择状态
- **Canvas 生命周期**: `watchForImage()` + `waitForImageReady()` 渐进式重试机制
- **缩放平移**: CSS `transform: translate() scale()` 应用于容器，`getCanvasCoords()` 反映射鼠标坐标
- **事件处理**: mousedown/mousemove/mouseup 区分拖拽（pan）和点击（添加水印），双击重置视图

**全局接口** (供 Python `_js` 调用):
```javascript
window.watermarkUndo()          // 撤销最后一个水印
window.watermarkClearAll()      // 清除所有水印
window.watermarkRemoveCanvas()  // 移除 Canvas 覆盖层
```

## 关键技术

### Python↔JS Bridge 模式

Gradio `gr.State` 更新无法直接同步到 JS。解决方案：
- 隐藏 `gr.Textbox` (`#watermark_selected_bridge`) 作为桥梁
- Python 写入 JSON → JS 通过 MutationObserver + input 事件 + 轮询三重监听读取
- JS 点击坐标通过 `#watermark_click_coords` Textbox 传回 Python
- 使用 `nativeInputValueSetter` 触发 Gradio 的 change 事件

### Canvas 覆盖层

- 透明 Canvas 绝对定位在 Gradio Image 组件的 `<img>` 元素上方
- `pointer-events: auto` 捕获鼠标事件
- 清除图片时通过 `watermarkRemoveCanvas()` 移除 Canvas，避免阻挡 Gradio dropzone

### 图片加载 (大图防黑屏)

```javascript
function waitForImageReady(imgEl, callback, attempt) {
    // 渐进式重试：前5次 100ms，之后 300ms，再之后 500ms
    // 最多重试 30 次（约9秒）
    // 检查 complete && naturalWidth > 0 && decode()
}
```

### 缩放平移

- CSS `transform: translate(panX, panY) scale(zoom)` + `transform-origin: 0 0`
- `syncCanvasSize()` 临时移除 transform 获取真实尺寸
- `getCanvasCoords()` 通过 `getBoundingClientRect()` 自动映射（已含 transform）
- 缩放围绕鼠标位置：通过调整 pan 使鼠标下的点保持不动

### Polyglot 文件

```python
# PNG 数据 + ZIP 数据 拼接
with open(output_path, 'wb') as f:
    f.write(png_data)   # PNG 格式允许末尾有额外数据
    f.write(zip_data)   # ZIP 工具可识别文件中的 ZIP 结构
```

### 水印数据格式

**文字水印** (JSON):
```json
{
    "type": "text",
    "text": "© 2024",
    "font_size": 48,
    "color": "#FFFFFF",
    "opacity": 0.7,
    "timestamp": 1234567890
}
```

**图片水印**: 直接存储图片文件于 `watermarks/images/`

**水印配置** (添加到图片时):
```json
{
    "type": "text|image",
    "x": 0.5, "y": 0.5,
    "size": 100,
    "rotation": 0,
    "opacity": 0.7,
    "text": "...", "color": "...",
    "path": "..."
}
```

## 调试

### Python 端
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### JavaScript 端
浏览器控制台查看 `[Watermark]` 前缀的日志。

### 常见问题排查
- **标签页不显示**: 检查 `script_callbacks.on_ui_tabs()` 返回格式
- **Bridge 不同步**: 检查 `#watermark_selected_bridge textarea` 是否存在
- **Canvas 不出现**: 检查 `#watermark_editor img` 是否加载完成
- **坐标偏移**: 检查 `getBoundingClientRect()` 与 CSS transform 的关系

## 提交规范

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 重构
```

## 许可证

MIT License
