# WebUI-Forge 水印添加扩展

[English](README.md) | 简体中文

这是一个用于 Stable Diffusion WebUI Forge 的扩展程序，提供强大的图片水印添加功能。

## ✨ 功能特性

### 核心功能
- 📝 **文字水印**：创建和保存自定义文字水印，支持颜色、大小、透明度调整
- 🖼️ **图片水印**：上传和管理图片水印（支持 PNG 透明背景）
- 🎨 **可视化编辑**：通过鼠标交互直观地添加水印到图片上
- 🔄 **实时预览**：水印跟随鼠标移动，即时查看效果
- ↶ **撤销功能**：支持撤销最后添加的水印

### 保存选项
- 💾 **普通保存**：保存为标准 PNG 格式的带水印图片
- 📦 **可解压图片包**：特殊的 Polyglot 文件
  - 外观是普通 PNG 图片（显示带水印版本）
  - 将后缀改为 `.zip` 可以解压出原始图片
  - 一个文件包含两个版本

### 交互控制
- 🖱️ **鼠标滚轮**：快速调整水印大小
- ⌨️ **Ctrl + 滚轮**：快速调整水印旋转角度
- 👆 **点击添加**：在任意位置添加水印
- 📚 **水印库**：保存和管理常用水印

### 集成功能
- 🔗 **无缝集成**：从 txt2img/img2img 直接发送图片到水印区
- 🎯 **独立标签页**：不影响原有功能，独立的操作界面

## 📦 安装方法

### 方法 1：Git 克隆（推荐）

```bash
# 进入 WebUI Forge 的 extensions 目录
cd stable-diffusion-webui-forge/extensions/

# 克隆仓库
git clone https://github.com/yourusername/sd-webui-watermark-adder.git

# 重启 WebUI Forge
```

### 方法 2：手动安装

1. 下载本项目的 ZIP 文件
2. 解压到 `stable-diffusion-webui-forge/extensions/` 目录
3. 确保文件夹名为 `sd-webui-watermark-adder`
4. 重启 WebUI Forge

### 验证安装

启动 WebUI Forge 后，应该能看到 "Watermark Adder" 标签页。

## 🚀 快速开始

### 1. 上传图片
- 在左侧"图像编辑区"上传图片
- 或从其他标签页点击"发送到水印区"

### 2. 创建水印

**文字水印：**
```
1. 切换到"文字水印"标签页
2. 输入文字（如 "© 2024 我的作品"）
3. 调整字体大小、颜色、透明度
4. 输入水印名称并保存
```

**图片水印：**
```
1. 切换到"图片水印"标签页
2. 上传 PNG 图片（建议透明背景）
3. 自动保存到水印库
```

### 3. 添加水印
```
1. 在水印库中选择一个水印
2. 鼠标移动到编辑区，水印跟随鼠标
3. 滚轮调整大小，Ctrl+滚轮调整角度
4. 点击左键添加水印
5. 可以添加多个水印
```

### 4. 生成和保存
```
1. 点击"生成水印图片"
2. 在右侧预览效果
3. 选择保存方式：
   - 保存图片：普通 PNG
   - 保存可解压图片包：特殊格式
```

## 🎯 使用场景

### 场景 1：为 AI 生成图片添加版权信息
```
txt2img 生成图片 → 发送到水印区 → 添加版权水印 → 保存
```

### 场景 2：批量添加品牌 Logo
```
上传图片 → 选择 Logo 水印 → 添加到固定位置 → 保存
```

### 场景 3：保护原图同时分享
```
添加水印 → 保存可解压图片包 → 分享带水印版本 → 自己保留原图
```

## 📖 详细文档

- [快速开始指南](QUICKSTART.md) - 详细的使用教程
- [项目需求文档](PROJECT_REQUIREMENTS.md) - 完整的功能说明和技术细节

## 🔧 技术栈

- **后端**: Python 3.x
- **UI 框架**: Gradio
- **图像处理**: Pillow (PIL)
- **前端交互**: JavaScript + HTML5 Canvas
- **特殊技术**: Polyglot 文件（PNG + ZIP）

## 📂 项目结构

```
sd-webui-watermark-adder/
├── scripts/
│   └── watermark_adder.py      # 主扩展脚本
├── javascript/
│   └── watermark_canvas.js     # 前端交互
├── watermarks/
│   ├── images/                 # 图片水印存储
│   └── texts/                  # 文字水印配置
├── install.py                  # 依赖安装
├── README.md                   # 英文说明
├── README_CN.md                # 中文说明
├── QUICKSTART.md               # 快速开始
└── PROJECT_REQUIREMENTS.md     # 需求文档
```

## ❓ 常见问题

### Q: 看不到 Watermark Adder 标签页？
**A**: 检查以下几点：
- 确认项目在 `extensions` 目录下
- 已重启 WebUI Forge
- 查看控制台是否有错误

### Q: 如何使用可解压图片包？
**A**:
```bash
# 1. 保存可解压图片包，得到 extractable_xxx.png
# 2. 改后缀为 .zip
mv extractable_xxx.png extractable_xxx.zip
# 3. 解压
unzip extractable_xxx.zip
# 4. 得到 original_image.png
```

### Q: 水印文字显示异常？
**A**: 可能是字体问题，系统会使用默认字体。建议：
- 使用常见字符
- 或使用图片水印代替

### Q: 保存的文件在哪里？
**A**: 默认保存在：
```
stable-diffusion-webui-forge/outputs/watermarked/
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发计划
- [ ] 支持批量处理
- [ ] 支持更多字体
- [ ] 水印模板功能
- [ ] 水印位置预设（九宫格）
- [ ] 水印平铺效果

## 📄 许可证

MIT License

## 🙏 致谢

感谢 Stable Diffusion WebUI Forge 项目和社区的支持。

---

**注意**: 这是一个 WebUI Forge 扩展，需要安装在 Stable Diffusion WebUI Forge 环境中才能使用。
