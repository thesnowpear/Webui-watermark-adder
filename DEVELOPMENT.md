# 开发说明文档

## 项目概述

这是一个为 **Stable Diffusion WebUI Forge** 开发的扩展程序，用于为图片添加水印。

**重要**: 这不是一个独立应用，必须安装在 WebUI Forge 的 `extensions` 目录下运行。

## 开发环境设置

### 前置要求
- Python 3.8+
- Stable Diffusion WebUI Forge 已安装
- Pillow >= 9.0.0

### 开发模式安装
```bash
# 1. 进入 WebUI Forge 的 extensions 目录
cd /path/to/stable-diffusion-webui-forge/extensions/

# 2. 克隆或链接本项目
ln -s /path/to/dev/sd-webui-watermark-adder ./

# 3. 安装依赖
cd sd-webui-watermark-adder
python install.py

# 4. 启动 WebUI Forge（开发模式）
cd ../..
python webui.py --listen --api
```

## 项目架构

### 文件结构
```
sd-webui-watermark-adder/
├── scripts/
│   └── watermark_adder.py          # 主扩展脚本（Python）
├── javascript/
│   └── watermark_canvas.js         # 前端交互脚本
├── watermarks/
│   ├── images/                     # 用户上传的图片水印
│   └── texts/                      # 用户保存的文字水印配置
├── install.py                      # 依赖安装脚本
├── README.md                       # 英文文档
├── README_CN.md                    # 中文文档
├── QUICKSTART.md                   # 快速开始指南
├── PROJECT_REQUIREMENTS.md         # 项目需求文档
└── DEVELOPMENT.md                  # 本文件
```

### 核心组件

#### 1. watermark_adder.py (后端)

**主要类**: `WatermarkAdderScript`

继承自 `modules.scripts.Script`，这是 WebUI Forge 的扩展基类。

**关键方法**:
- `title()`: 返回扩展名称
- `show()`: 控制扩展显示（返回 `scripts.AlwaysVisible` 表示独立标签页）
- `ui()`: 创建 Gradio UI 界面

**核心功能函数**:
```python
# 水印管理
save_text_watermark_func()      # 保存文字水印配置
upload_image_watermark_func()   # 上传图片水印
list_watermarks_func()          # 列出所有水印
delete_watermark()              # 删除水印

# 图像处理
apply_watermark()               # 在图片上添加水印
render_watermarks()             # 渲染所有水印到图片

# 特殊功能
create_extractable_image()      # 创建 Polyglot 文件
create_text_preview()           # 创建文字水印预览图
```

#### 2. watermark_canvas.js (前端)

**全局状态对象**: `watermarkState`
```javascript
{
    selectedWatermark: null,        // 当前选中的水印
    watermarkSize: 100,             // 水印大小
    watermarkRotation: 0,           // 水印角度
    isPreviewMode: false,           // 是否在预览模式
    previewPosition: {x, y},        // 预览位置
    watermarks: [],                 // 已添加的水印列表
    canvas: null,                   // Canvas 元素
    ctx: null,                      // Canvas 上下文
    baseImage: null                 // 基础图像
}
```

**核心函数**:
```javascript
initWatermarkCanvas()           // 初始化
setupEventListeners()           // 设置事件监听
createCanvasOverlay()           // 创建 Canvas 覆盖层
handleMouseMove()               // 鼠标移动处理
handleClick()                   // 点击添加水印
handleWheel()                   // 滚轮调整大小/角度
redrawCanvas()                  // 重绘 Canvas
drawWatermark()                 // 绘制单个水印
```

**暴露的全局函数**:
```javascript
window.setSelectedWatermark()   // 设置选中的水印
window.undoLastWatermark()      // 撤销
window.clearAllWatermarks()     // 清除所有
window.getWatermarkedImage()    // 获取合成图片
```

## 关键技术实现

### 1. Gradio UI 布局

使用 Gradio 的 `Blocks` API 创建自定义布局：

```python
with gr.Blocks() as watermark_interface:
    with gr.Row():
        with gr.Column(scale=1):  # 左侧
            # 编辑区
            image_editor = gr.Image(...)
            # 控件
            with gr.Row():
                undo_btn = gr.Button(...)
            # 水印选择
            with gr.Tabs():
                with gr.Tab("文字水印"):
                    ...
                with gr.Tab("图片水印"):
                    ...

        with gr.Column(scale=1):  # 右侧
            # 预览区
            preview_image = gr.Image(...)
            # 保存按钮
            save_normal_btn = gr.Button(...)
```

### 2. Canvas 覆盖层技术

在 Gradio 的 Image 组件上覆盖一个 Canvas 层：

```javascript
// 1. 创建 Canvas
const canvas = document.createElement('canvas');
canvas.style.position = 'absolute';
canvas.style.zIndex = '10';

// 2. 添加到容器
container.appendChild(canvas);

// 3. 监听事件
canvas.addEventListener('mousemove', ...);
canvas.addEventListener('click', ...);
```

### 3. Polyglot 文件生成

创建既是图片又是 ZIP 的文件：

```python
# 1. 保存带水印的图片
watermarked_image.save(temp_path, format='PNG')

# 2. 读取图片数据
with open(temp_path, 'rb') as f:
    image_data = f.read()

# 3. 创建 ZIP 数据
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w') as zf:
    zf.write(original_image_path, arcname="original_image.png")
zip_data = zip_buffer.getvalue()

# 4. 合并
with open(output_path, 'wb') as f:
    f.write(image_data)  # 图片在前
    f.write(zip_data)     # ZIP 在后
```

**原理**: PNG 格式允许文件末尾有额外数据，ZIP 工具可以识别文件中的 ZIP 结构。

### 4. 水印数据存储

**文字水印** (JSON 格式):
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

**图片水印**: 直接存储图片文件

## 待完善功能

### 当前限制
1. **Python-JavaScript 数据交互**: 目前 JavaScript 的水印添加操作没有完全同步到 Python 后端
2. **字体支持**: 仅支持系统默认字体
3. **批量处理**: 不支持批量添加水印
4. **水印模板**: 没有预设模板功能

### 改进方向

#### 1. 完善数据交互
需要实现 JavaScript 添加的水印数据传回 Python：

```python
# 在 generate_btn.click 中
def generate_func(img, watermark_data_json):
    # watermark_data_json 从 JavaScript 传来
    watermark_data = json.loads(watermark_data_json)

    # 在 Python 中重新渲染所有水印
    for item in watermark_data:
        img = apply_watermark(img, item)

    return img
```

```javascript
// 在 JavaScript 中
generate_btn.addEventListener('click', () => {
    const data = JSON.stringify(watermarkState.watermarks);
    // 传递给 Python
});
```

#### 2. 添加字体支持
```python
# 支持自定义字体
FONT_DIR = extension_dir / "fonts"

def get_available_fonts():
    fonts = []
    for font_file in FONT_DIR.glob("*.ttf"):
        fonts.append(font_file.name)
    return fonts

# UI 中添加字体选择
font_dropdown = gr.Dropdown(
    choices=get_available_fonts(),
    label="字体"
)
```

#### 3. 实现批量处理
```python
def batch_add_watermark(images, watermark, positions):
    results = []
    for img, pos in zip(images, positions):
        result = apply_watermark(img, watermark, pos)
        results.append(result)
    return results
```

#### 4. 水印模板系统
```python
# 模板配置
TEMPLATES = {
    "corner": {"position": "bottom-right", "size": 100},
    "center": {"position": "center", "size": 200},
    "tiled": {"pattern": "repeat", "spacing": 300}
}

def apply_template(img, watermark, template_name):
    template = TEMPLATES[template_name]
    # 根据模板应用水印
    pass
```

## 调试技巧

### 1. Python 调试
```python
# 在 watermark_adder.py 中添加日志
import logging
logging.basicConfig(level=logging.DEBUG)

def some_function():
    logging.debug(f"Debug info: {variable}")
```

### 2. JavaScript 调试
```javascript
// 在浏览器控制台查看
console.log("Watermark state:", watermarkState);

// 检查 Canvas
console.log("Canvas:", watermarkState.canvas);
console.log("Context:", watermarkState.ctx);
```

### 3. 查看 Gradio 组件
```python
# 打印组件值
def debug_func(*args):
    print("Inputs:", args)
    return args[0]

button.click(fn=debug_func, inputs=[...], outputs=[...])
```

## 测试

### 单元测试
```python
# tests/test_watermark.py
import unittest
from scripts.watermark_adder import WatermarkAdderScript

class TestWatermark(unittest.TestCase):
    def test_create_text_watermark(self):
        script = WatermarkAdderScript()
        # 测试逻辑
        pass
```

### 集成测试
1. 启动 WebUI Forge
2. 打开 Watermark Adder 标签页
3. 执行完整工作流
4. 验证输出文件

### 性能测试
```python
import time

def benchmark_watermark():
    start = time.time()
    # 执行水印添加
    end = time.time()
    print(f"Time: {end - start}s")
```

## 发布流程

### 1. 版本更新
```bash
# 更新版本号
# 在 README.md 中更新版本信息
```

### 2. 测试
```bash
# 运行所有测试
python -m pytest tests/

# 手动测试所有功能
```

### 3. 提交
```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

### 4. 发布
- 创建 GitHub Release
- 附上更新日志
- 提供安装说明

## 贡献指南

### 代码规范
- Python: PEP 8
- JavaScript: ESLint
- 注释: 中英文均可

### 提交规范
```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 重构
test: 添加测试
```

## 常见问题

### Q: 如何添加新的水印类型？
A:
1. 在 `watermark_adder.py` 中添加新的处理函数
2. 在 UI 中添加新的标签页
3. 在 JavaScript 中添加对应的绘制逻辑

### Q: 如何优化大图片处理？
A:
1. 使用图片缩略图进行预览
2. 异步处理图片
3. 添加进度条

### Q: 如何支持更多输出格式？
A:
```python
def save_image(img, format='PNG'):
    if format == 'JPEG':
        img.save(path, format='JPEG', quality=95)
    elif format == 'WEBP':
        img.save(path, format='WEBP', quality=90)
```

## 资源链接

- [Gradio 文档](https://www.gradio.app/docs/)
- [Pillow 文档](https://pillow.readthedocs.io/)
- [WebUI Forge GitHub](https://github.com/lllyasviel/stable-diffusion-webui-forge)
- [扩展开发指南](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Developing-extensions)

## 联系方式

如有问题，请提交 Issue 或 Pull Request。
