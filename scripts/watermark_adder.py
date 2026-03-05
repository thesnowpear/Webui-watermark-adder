import os
import json
import zipfile
import io
import gradio as gr
from PIL import Image, ImageDraw, ImageFont
from modules import scripts
from pathlib import Path
import shutil
import time

class WatermarkAdderScript(scripts.Script):
    def __init__(self):
        super().__init__()
        self.extension_dir = Path(__file__).parent.parent
        self.watermarks_dir = self.extension_dir / "watermarks"
        self.images_dir = self.watermarks_dir / "images"
        self.texts_dir = self.watermarks_dir / "texts"

        # 确保目录存在
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.texts_dir.mkdir(parents=True, exist_ok=True)

        # 水印状态
        self.current_watermarks = []  # 当前图片上的水印列表
        self.original_image = None
        self.working_image = None

    def title(self):
        return "Watermark Adder"

    def show(self, is_img2img):
        return scripts.AlwaysVisible

    def ui(self, is_img2img):
        with gr.Blocks() as watermark_interface:
            gr.Markdown("# 🎨 水印添加工具")

            with gr.Row():
                # 左侧：编辑区域
                with gr.Column(scale=1):
                    gr.Markdown("### 图像编辑区")

                    # 图像编辑区
                    image_editor = gr.Image(
                        label="编辑区域",
                        type="pil",
                        interactive=True,
                        elem_id="watermark_editor"
                    )

                    # 编辑控件
                    with gr.Row():
                        undo_btn = gr.Button("↶ 撤销", size="sm")
                        clear_btn = gr.Button("🗑️ 清除图片", size="sm")
                        size_slider = gr.Slider(
                            minimum=10,
                            maximum=500,
                            value=100,
                            step=5,
                            label="水印大小",
                            elem_id="watermark_size"
                        )
                        rotation_slider = gr.Slider(
                            minimum=0,
                            maximum=360,
                            value=0,
                            step=15,
                            label="水印角度",
                            elem_id="watermark_rotation"
                        )

                    # 水印选择区
                    gr.Markdown("### 水印选择")
                    with gr.Tabs():
                        # 文字水印标签页
                        with gr.Tab("文字水印"):
                            watermark_text = gr.Textbox(
                                label="水印文字",
                                placeholder="输入水印文字...",
                                value="© 2024"
                            )
                            with gr.Row():
                                text_font_size = gr.Slider(
                                    minimum=10,
                                    maximum=200,
                                    value=48,
                                    step=2,
                                    label="字体大小"
                                )
                                text_color = gr.ColorPicker(
                                    label="文字颜色",
                                    value="#FFFFFF"
                                )
                            text_opacity = gr.Slider(
                                minimum=0,
                                maximum=1,
                                value=0.7,
                                step=0.05,
                                label="透明度"
                            )
                            with gr.Row():
                                save_text_watermark_btn = gr.Button("💾 保存文字水印")
                                text_watermark_name = gr.Textbox(
                                    label="水印名称",
                                    placeholder="我的水印",
                                    scale=2
                                )

                        # 图片水印标签页
                        with gr.Tab("图片水印"):
                            watermark_image_upload = gr.File(
                                label="上传水印图片",
                                file_types=["image"]
                            )
                            upload_watermark_btn = gr.Button("📤 上传图片水印")

                    # 已保存的水印列表
                    gr.Markdown("### 已保存的水印")
                    watermark_gallery = gr.Gallery(
                        label="水印库",
                        columns=4,
                        height="auto",
                        elem_id="watermark_gallery"
                    )
                    with gr.Row():
                        refresh_watermarks_btn = gr.Button("🔄 刷新")
                        delete_watermark_btn = gr.Button("🗑️ 删除选中")

                    selected_watermark = gr.State(None)

                    # 生成按钮
                    generate_btn = gr.Button("✨ 生成水印图片", variant="primary", size="lg")

                # 右侧：预览和保存区域
                with gr.Column(scale=1):
                    gr.Markdown("### 预览区域")
                    preview_image = gr.Image(
                        label="预览",
                        type="pil",
                        interactive=False
                    )

                    gr.Markdown("### 保存选项")
                    with gr.Row():
                        save_normal_btn = gr.Button("💾 保存图片", variant="primary")
                        save_extractable_btn = gr.Button("📦 保存可解压图片包", variant="secondary")

                    save_status = gr.Textbox(
                        label="保存状态",
                        interactive=False,
                        lines=2
                    )

            # 事件处理函数
            def save_text_watermark_func(text, font_size, color, opacity, name):
                if not text or not name:
                    return "请输入水印文字和名称", self.list_watermarks()

                watermark_data = {
                    "type": "text",
                    "text": text,
                    "font_size": font_size,
                    "color": color,
                    "opacity": opacity,
                    "timestamp": time.time()
                }

                save_path = self.texts_dir / f"{name}.json"
                with open(save_path, 'w', encoding='utf-8') as f:
                    json.dump(watermark_data, f, ensure_ascii=False, indent=2)

                return f"文字水印 '{name}' 已保存", self.list_watermarks()

            def upload_image_watermark_func(file):
                if file is None:
                    return "请选择图片文件", self.list_watermarks()

                # 保存上传的图片
                filename = Path(file.name).name
                save_path = self.images_dir / filename
                shutil.copy(file.name, save_path)

                return f"图片水印 '{filename}' 已上传", self.list_watermarks()

            def list_watermarks_func():
                return self.list_watermarks()

            def clear_image_func():
                self.original_image = None
                self.working_image = None
                self.current_watermarks = []
                return None, None

            def undo_func(img):
                if len(self.current_watermarks) > 0:
                    self.current_watermarks.pop()
                    return self.render_watermarks()
                return img

            def generate_func(img, text, font_size, color, opacity, size, rotation):
                if img is None:
                    return None, "请先上传图片"

                self.original_image = img
                self.working_image = img.copy()

                # 这里简化处理，实际应该通过 JavaScript 交互添加水印
                # 暂时返回原图作为预览
                return img, "请在编辑区点击添加水印"

            def save_normal_func(img):
                if img is None:
                    return "没有可保存的图片"

                output_dir = Path("outputs/watermarked")
                output_dir.mkdir(parents=True, exist_ok=True)

                timestamp = int(time.time())
                output_path = output_dir / f"watermarked_{timestamp}.png"
                img.save(output_path)

                return f"图片已保存到: {output_path}"

            def save_extractable_func(img):
                if img is None or self.original_image is None:
                    return "没有可保存的图片"

                output_dir = Path("outputs/watermarked")
                output_dir.mkdir(parents=True, exist_ok=True)

                timestamp = int(time.time())
                output_path = output_dir / f"extractable_{timestamp}.png"

                # 创建 polyglot 文件
                self.create_extractable_image(img, self.original_image, output_path)

                return f"可解压图片包已保存到: {output_path}\n提示: 将文件后缀改为 .zip 即可解压出原图"

            # 绑定事件
            save_text_watermark_btn.click(
                fn=save_text_watermark_func,
                inputs=[watermark_text, text_font_size, text_color, text_opacity, text_watermark_name],
                outputs=[save_status, watermark_gallery]
            )

            upload_watermark_btn.click(
                fn=upload_image_watermark_func,
                inputs=[watermark_image_upload],
                outputs=[save_status, watermark_gallery]
            )

            refresh_watermarks_btn.click(
                fn=list_watermarks_func,
                outputs=[watermark_gallery]
            )

            clear_btn.click(
                fn=clear_image_func,
                outputs=[image_editor, preview_image]
            )

            undo_btn.click(
                fn=undo_func,
                inputs=[image_editor],
                outputs=[image_editor]
            )

            generate_btn.click(
                fn=generate_func,
                inputs=[image_editor, watermark_text, text_font_size, text_color, text_opacity, size_slider, rotation_slider],
                outputs=[preview_image, save_status]
            )

            save_normal_btn.click(
                fn=save_normal_func,
                inputs=[preview_image],
                outputs=[save_status]
            )

            save_extractable_btn.click(
                fn=save_extractable_func,
                inputs=[preview_image],
                outputs=[save_status]
            )

        return []

    def list_watermarks(self):
        """列出所有保存的水印"""
        watermarks = []

        # 列出图片水印
        for img_path in self.images_dir.glob("*"):
            if img_path.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif']:
                watermarks.append(str(img_path))

        # 为文字水印创建预览图
        for text_path in self.texts_dir.glob("*.json"):
            preview_path = self.texts_dir / f"{text_path.stem}_preview.png"
            if not preview_path.exists():
                # 创建文字水印预览
                with open(text_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.create_text_preview(data, preview_path)
            watermarks.append(str(preview_path))

        return watermarks

    def create_text_preview(self, watermark_data, output_path):
        """创建文字水印预览图"""
        img = Image.new('RGBA', (200, 100), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("arial.ttf", int(watermark_data['font_size'] / 2))
        except:
            font = ImageFont.load_default()

        text = watermark_data['text']
        color = watermark_data['color']

        # 转换颜色
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            color = (r, g, b, int(255 * watermark_data['opacity']))

        # 居中绘制文字
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        position = ((200 - text_width) // 2, (100 - text_height) // 2)

        draw.text(position, text, fill=color, font=font)
        img.save(output_path)

    def create_extractable_image(self, watermarked_image, original_image, output_path):
        """创建可解压的图片包（polyglot 文件）"""
        # 1. 保存带水印的图片到临时位置
        temp_watermarked = output_path.parent / "temp_watermarked.png"
        watermarked_image.save(temp_watermarked, format='PNG')

        # 2. 读取带水印图片数据
        with open(temp_watermarked, 'rb') as f:
            image_data = f.read()

        # 3. 创建 ZIP 数据（包含原图）
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 保存原图到临时文件
            temp_original = output_path.parent / "temp_original.png"
            original_image.save(temp_original, format='PNG')
            zf.write(temp_original, arcname="original_image.png")
            temp_original.unlink()

        zip_data = zip_buffer.getvalue()

        # 4. 合并图片和 ZIP 数据
        with open(output_path, 'wb') as f:
            f.write(image_data)  # 先写图片
            f.write(zip_data)     # 再追加 ZIP

        # 清理临时文件
        temp_watermarked.unlink()
