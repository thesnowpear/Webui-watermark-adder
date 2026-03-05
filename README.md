# WebUI-Forge 水印添加扩展

这是一个用于 Stable Diffusion WebUI Forge 的扩展程序，提供强大的图片水印添加功能。

## 功能特性

- 📝 **文字水印**：创建和保存自定义文字水印
- 🖼️ **图片水印**：上传和管理图片水印
- 🎨 **可视化编辑**：通过鼠标交互直观地添加水印
- 🔄 **实时预览**：即时查看水印效果
- 💾 **双重保存**：
  - 普通保存：带水印的图片
  - 可解压图片包：外观是图片，改后缀名为 .zip 可解压出原图
- ⚙️ **灵活调整**：
  - 鼠标滚轮调整水印大小
  - Ctrl + 滚轮调整水印方向
  - 撤销功能支持

## 安装方法

1. 进入 WebUI Forge 的 `extensions` 目录
2. 克隆此仓库：
   ```bash
   git clone https://github.com/yourusername/sd-webui-watermark-adder.git
   ```
3. 重启 WebUI Forge

## 使用方法

1. 在 WebUI 中找到 "Watermark Adder" 标签页
2. 上传或从其他标签页发送图片到编辑区
3. 在水印选择区创建或选择水印
4. 鼠标移动到编辑区，水印会跟随鼠标
5. 点击左键添加水印到图片上
6. 点击"生成"按钮生成最终图片

## 技术栈

- Python 3.x
- Gradio
- Pillow (PIL)
- HTML5 Canvas

## 许可证

MIT License
