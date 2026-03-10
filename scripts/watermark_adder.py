import io
import json
import os
import shutil
import sys
import time
import zipfile
from pathlib import Path

import gradio as gr
from PIL import Image, ImageDraw, ImageFont
from modules import script_callbacks


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.append(str(SCRIPT_DIR))

from watermark_renderer import WatermarkRenderer


SHAPE_TYPES = [
    ("rectangle", "长方形"),
    ("square", "正方形"),
    ("ellipse", "椭圆形"),
    ("circle", "圆形"),
]


class WatermarkManager:
    def __init__(self):
        self.extension_dir = Path(__file__).parent.parent
        self.watermarks_dir = self.extension_dir / "watermarks"
        self.images_dir = self.watermarks_dir / "images"
        self.texts_dir = self.watermarks_dir / "texts"
        self.shapes_dir = self.watermarks_dir / "shape_previews"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.texts_dir.mkdir(parents=True, exist_ok=True)
        self.shapes_dir.mkdir(parents=True, exist_ok=True)
        self.original_image = None
        self._font_cache = {}
        self.renderer = WatermarkRenderer()

    def list_image_watermarks(self):
        results = []
        for img_path in sorted(self.images_dir.glob("*")):
            if img_path.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]:
                results.append(str(img_path))
        return results

    def list_text_watermarks(self):
        results = []
        for text_path in sorted(self.texts_dir.glob("*.json")):
            try:
                with open(text_path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                data["_filename"] = text_path.stem
                data["_path"] = str(text_path)
                results.append(data)
            except Exception:
                continue
        return results

    def get_image_watermark_gallery(self):
        return [(img_path, Path(img_path).stem) for img_path in self.list_image_watermarks()]

    def get_text_watermark_gallery(self):
        items = []
        for data in self.list_text_watermarks():
            preview_path = self.texts_dir / f"{data['_filename']}_preview.png"
            self._create_text_preview(data, preview_path)
            items.append((str(preview_path), data["_filename"]))
        return items

    def get_shape_watermark_gallery(self):
        items = []
        for shape_key, shape_name in SHAPE_TYPES:
            preview_path = self.shapes_dir / f"{shape_key}.png"
            self._create_shape_preview(shape_key, preview_path)
            items.append((str(preview_path), shape_name))
        return items

    def _get_font(self, size):
        size = max(1, int(size))
        if size not in self._font_cache:
            try:
                self._font_cache[size] = ImageFont.truetype("arial.ttf", size)
            except Exception:
                self._font_cache[size] = ImageFont.load_default()
        return self._font_cache[size]

    def _hex_to_rgba(self, color, opacity):
        if isinstance(color, str) and color.startswith("#") and len(color) >= 7:
            red = int(color[1:3], 16)
            green = int(color[3:5], 16)
            blue = int(color[5:7], 16)
        else:
            red, green, blue = 255, 255, 255
        alpha = int(255 * max(0.0, min(1.0, opacity)))
        return red, green, blue, alpha

    def _create_text_preview(self, watermark_data, output_path):
        image = Image.new("RGBA", (200, 100), (40, 40, 40, 255))
        draw = ImageDraw.Draw(image)
        font = self._get_font(min(int(watermark_data.get("font_size", 48) / 2), 40))
        text = watermark_data.get("text", "?")
        color = self._hex_to_rgba(watermark_data.get("color", "#FFFFFF"), watermark_data.get("opacity", 1.0))
        bbox = draw.textbbox((0, 0), text, font=font)
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        draw.text(((200 - width) // 2, (100 - height) // 2), text, fill=color, font=font)
        image.save(output_path)

    def _create_shape_preview(self, shape_type, output_path):
        image = Image.new("RGBA", (176, 132), (24, 27, 33, 255))
        draw = ImageDraw.Draw(image)
        center_x = 88
        center_y = 66
        draw.rounded_rectangle((16, 12, 160, 120), radius=18, outline=(82, 88, 102, 90), width=1)
        draw.line((88, 20, 88, 42), fill=(92, 99, 112, 72), width=1)
        draw.line((88, 90, 88, 112), fill=(92, 99, 112, 72), width=1)
        draw.line((30, 66, 52, 66), fill=(92, 99, 112, 72), width=1)
        draw.line((124, 66, 146, 66), fill=(92, 99, 112, 72), width=1)
        if shape_type in ("rectangle", "ellipse"):
            half_w = 36
            half_h = 24
        else:
            half_w = 28
            half_h = 28
        bounds = (center_x - half_w, center_y - half_h, center_x + half_w, center_y + half_h)
        glow_bounds = (bounds[0] - 8, bounds[1] - 8, bounds[2] + 8, bounds[3] + 8)
        fill = (246, 248, 255, 30)
        stroke = (246, 248, 255, 230)
        glow = (96, 154, 255, 52)
        if shape_type in ("circle", "ellipse"):
            draw.ellipse(glow_bounds, outline=glow, width=2)
            draw.ellipse(bounds, fill=fill, outline=stroke, width=2)
        else:
            draw.rounded_rectangle(glow_bounds, radius=12, outline=glow, width=2)
            draw.rounded_rectangle(bounds, radius=10 if shape_type == "square" else 8, fill=fill, outline=stroke, width=2)
        image.save(output_path)

    def apply_watermark_to_image(self, base_image, watermark_configs):
        return self.renderer.render(base_image, watermark_configs)

    def create_extractable_image(self, watermarked_image, original_image, output_path):
        temp_watermarked = output_path.parent / "temp_watermarked.png"
        watermarked_image.save(temp_watermarked, format="PNG")
        with open(temp_watermarked, "rb") as handle:
            image_data = handle.read()
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            temp_original = output_path.parent / "temp_original.png"
            original_image.save(temp_original, format="PNG")
            archive.write(temp_original, arcname="original_image.png")
            temp_original.unlink()
        with open(output_path, "wb") as handle:
            handle.write(image_data)
            handle.write(zip_buffer.getvalue())
        temp_watermarked.unlink()


manager = WatermarkManager()


def _resolve_file_path(file_obj):
    if file_obj is None:
        return None
    if isinstance(file_obj, str) and os.path.exists(file_obj):
        return file_obj
    if hasattr(file_obj, "name") and isinstance(file_obj.name, str) and os.path.exists(file_obj.name):
        return file_obj.name
    if isinstance(file_obj, dict):
        path = file_obj.get("name", "")
        if isinstance(path, str) and os.path.exists(path):
            return path
    return None


def _resolve_orig_name(file_obj):
    if isinstance(file_obj, str):
        return Path(file_obj).name
    if hasattr(file_obj, "orig_name") and file_obj.orig_name:
        return file_obj.orig_name
    if hasattr(file_obj, "name"):
        return Path(file_obj.name).name
    if isinstance(file_obj, dict):
        return Path(file_obj.get("name", "unknown.png")).name
    return "unknown.png"


def _get_output_dir():
    webui_root = Path(__file__).parent.parent.parent.parent
    output_dir = webui_root / "outputs" / "watermarked"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _make_base_name():
    return f"watermarked_{int(time.time())}"


def _clamp_ratio(value):
    return max(0.0, min(1.0, float(value)))


def _shape_name(shape_key):
    for key, label in SHAPE_TYPES:
        if key == shape_key:
            return label
    return shape_key or "形状"


def _shape_fill_name(fill_mode):
    return {"color": "颜色", "blur": "模糊", "mosaic": "马赛克"}.get(fill_mode, "颜色")


def _set_shape_mode(value):
    return value


def on_ui_tabs():
    with gr.Blocks(analytics_enabled=False) as watermark_tab:
        watermark_list_state = gr.State([])
        selected_img_idx = gr.State(-1)
        selected_txt_idx = gr.State(-1)

        gr.HTML(
            """
<style>
#watermark_panel_row {
    margin-top: -8px !important;
}
#watermark_img_gallery .thumbnail-item,
#watermark_img_gallery button,
#watermark_txt_gallery .thumbnail-item,
#watermark_txt_gallery button,
#watermark_shape_gallery .thumbnail-item,
#watermark_shape_gallery button {
    min-height: 84px !important;
    padding: 6px !important;
}
#watermark_img_gallery img,
#watermark_txt_gallery img,
#watermark_shape_gallery img {
    max-height: 78px !important;
    object-fit: contain !important;
}
#watermark_shape_gallery img {
    max-height: 84px !important;
}
#watermark_shape_mode_quick_tabs,
#watermark_control_panel {
    margin-top: 10px !important;
}
</style>
"""
        )
        with gr.Row(equal_height=False, elem_id="watermark_panel_row"):
            with gr.Column(scale=1, min_width=280):
                gr.Markdown("### 水印库")
                with gr.Tabs():
                    with gr.Tab("图片水印") as img_tab:
                        img_wm_gallery = gr.Gallery(
                            label="图片水印",
                            columns=3,
                            rows=2,
                            height=236,
                            object_fit="contain",
                            elem_id="watermark_img_gallery",
                            show_label=False,
                            allow_preview=False,
                        )
                        upload_img_wm = gr.File(label="上传图片水印", file_types=["image"], file_count="single")
                    with gr.Tab("文字水印") as txt_tab:
                        txt_wm_gallery = gr.Gallery(
                            label="文字水印",
                            columns=3,
                            rows=2,
                            height=236,
                            object_fit="contain",
                            elem_id="watermark_txt_gallery",
                            show_label=False,
                            allow_preview=False,
                        )
                        gr.Markdown("#### 新建文字水印")
                        wm_text_input = gr.Textbox(label="文字内容", value="© 2026", placeholder="输入水印文字")
                        with gr.Row():
                            wm_font_size = gr.Slider(minimum=10, maximum=200, value=48, step=2, label="字体大小")
                            wm_text_color = gr.ColorPicker(label="颜色", value="#FFFFFF")
                        with gr.Row():
                            wm_text_name = gr.Textbox(label="名称", placeholder="预设名称", scale=2)
                            save_txt_wm_btn = gr.Button("保存", size="sm", scale=1)
                    with gr.Tab("形状水印") as shape_tab:
                        shape_wm_gallery = gr.Gallery(
                            label="形状水印",
                            columns=4,
                            rows=1,
                            height=132,
                            object_fit="contain",
                            elem_id="watermark_shape_gallery",
                            show_label=False,
                            allow_preview=False,
                        )
                        shape_mode_quick_value = gr.Textbox(value="color", visible=False, elem_id="watermark_shape_mode_quick_value")
                        with gr.Tabs(elem_id="watermark_shape_mode_quick_tabs"):
                            with gr.Tab("颜色", elem_id="watermark_shape_mode_quick_color_tab") as shape_mode_quick_color_tab:
                                shape_color = gr.ColorPicker(label="形状颜色", value="#FFFFFF", elem_id="watermark_shape_color")
                            with gr.Tab("模糊", elem_id="watermark_shape_mode_quick_blur_tab") as shape_mode_quick_blur_tab:
                                shape_blur_quick = gr.Slider(minimum=1, maximum=200, value=32, step=1, label="模糊程度", elem_id="watermark_shape_blur_quick")
                            with gr.Tab("马赛克", elem_id="watermark_shape_mode_quick_mosaic_tab") as shape_mode_quick_mosaic_tab:
                                shape_mosaic_quick = gr.Slider(minimum=2, maximum=80, value=18, step=1, label="马赛克方块大小", elem_id="watermark_shape_mosaic_quick")
                with gr.Row():
                    refresh_wm_btn = gr.Button("刷新", size="sm")
                    deselect_wm_btn = gr.Button("取消选择", size="sm")
                with gr.Row():
                    delete_img_wm_btn = gr.Button("删除选中图片", size="sm")
                    delete_txt_wm_btn = gr.Button("删除选中文字", size="sm")
                wm_status = gr.Textbox(label="状态", interactive=False, lines=1, show_label=False, elem_id="watermark_status")

            with gr.Column(scale=2, min_width=420):
                gr.Markdown("### 编辑区")
                gr.Markdown(
                    "滚轮: 缩放图片 | 按住空格拖拽: 平移画布 | 双击: 重置视图 | "
                    "Ctrl+滚轮: 调整大小 | Shift+滚轮: 调整角度 | Alt+滚轮: 调整不透明度 | "
                    "Delete: 删除当前选中水印 | 右键: 取消选择 | Shift: 锁定比例"
                )
                image_editor = gr.Image(label="编辑画布", type="pil", interactive=True, elem_id="watermark_editor", height=512)
                with gr.Row():
                    fetch_last_btn = gr.Button("获取最近生成图片", size="sm", elem_id="watermark_fetch_last")
                    clear_btn = gr.Button("清除图片", size="sm")
                    undo_btn = gr.Button("撤销", size="sm")
                    delete_selected_btn = gr.Button("删除选中水印", size="sm")
                    clear_wm_btn = gr.Button("清空水印", size="sm")
                with gr.Group(elem_id="watermark_control_panel"):
                    control_hint_empty = gr.Markdown("从左侧选择一个水印添加，或点击画布中已有水印进入对应编辑区。", elem_id="watermark_control_hint_empty")
                    control_hint_image = gr.Markdown("图片水印支持大小、旋转和不透明度。", elem_id="watermark_control_hint_image")
                    text_content_editor = gr.Textbox(label="文字内容", value="", placeholder="输入当前文字水印内容", elem_id="watermark_text_content_editor", interactive=True)
                    with gr.Row():
                        wm_size_slider = gr.Slider(minimum=1, maximum=2000, value=100, step=1, label="水印大小", elem_id="watermark_size")
                        wm_rotation_slider = gr.Slider(minimum=0, maximum=360, value=0, step=5, label="旋转角度", elem_id="watermark_rotation")
                    wm_opacity_slider = gr.Slider(minimum=0.05, maximum=1.0, value=1.0, step=0.05, label="不透明度", elem_id="watermark_opacity")
                    shape_feather_editor = gr.Slider(minimum=0, maximum=80, value=8, step=1, label="羽化", elem_id="watermark_shape_feather_editor", interactive=True)
                    shape_color_editor = gr.ColorPicker(label="颜色", value="#FFFFFF", elem_id="watermark_shape_color_editor", interactive=True)
                    shape_blur_editor = gr.Slider(minimum=1, maximum=200, value=32, step=1, label="模糊程度", elem_id="watermark_shape_blur_editor", interactive=True)
                    shape_mosaic_editor = gr.Slider(minimum=2, maximum=80, value=18, step=1, label="马赛克方块大小", elem_id="watermark_shape_mosaic_editor", interactive=True)
                watermark_info = gr.Textbox(label="已添加水印", interactive=False, lines=6, placeholder="尚未添加水印")
                click_coords = gr.Textbox(visible=False, elem_id="watermark_click_coords")
                selected_wm_bridge = gr.Textbox(visible=False, elem_id="watermark_selected_bridge")
                edit_bridge = gr.Textbox(visible=False, elem_id="watermark_edit_bridge")
                gallery_meta_bridge = gr.Textbox(visible=False, elem_id="watermark_gallery_meta")

            with gr.Column(scale=1, min_width=280):
                gr.Markdown("### 预览与保存")
                generate_btn = gr.Button("生成带水印图片", variant="primary", size="lg")
                preview_image = gr.Image(label="预览", type="pil", interactive=False, height=400)
                gr.Markdown("### 保存")
                with gr.Row():
                    save_btn = gr.Button("保存 PNG", variant="primary")
                    save_extract_btn = gr.Button("保存可解压包", variant="secondary")
                save_status = gr.Textbox(label="保存状态", interactive=False, lines=2)
                with gr.Row():
                    auto_save_toggle = gr.Checkbox(label="自动保存到 outputs", value=True)
                    browser_download_toggle = gr.Checkbox(label="浏览器下载", value=False)
                download_path_bridge = gr.Textbox(visible=False, elem_id="watermark_download_path_bridge")

        def build_gallery_meta():
            text_payload = []
            for data in manager.list_text_watermarks():
                text_payload.append({
                    "text": data.get("text", ""),
                    "font_size": data.get("font_size", 48),
                    "color": data.get("color", "#FFFFFF"),
                    "opacity": data.get("opacity", 1.0),
                    "name": data.get("_filename", ""),
                })
            image_payload = []
            for image_path in manager.list_image_watermarks():
                image_payload.append({"path": image_path, "name": Path(image_path).stem})
            return json.dumps({"images": image_payload, "texts": text_payload}, ensure_ascii=False)

        def refresh_galleries():
            return (
                gr.update(value=manager.get_image_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_text_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_shape_watermark_gallery(), selected_index=None),
                build_gallery_meta(),
            )

        def auto_upload_image_watermark(file_obj):
            if file_obj is None:
                return None, manager.get_image_watermark_gallery(), build_gallery_meta()
            src_path = _resolve_file_path(file_obj)
            if src_path is None:
                return None, manager.get_image_watermark_gallery(), build_gallery_meta()
            original_name = _resolve_orig_name(file_obj)
            safe_name = "".join(ch for ch in original_name if ch.isalnum() or ch in "._- ").strip() or f"watermark_{int(time.time())}.png"
            if Path(safe_name).suffix.lower() not in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]:
                safe_name += ".png"
            save_path = manager.images_dir / safe_name
            if save_path.exists():
                save_path = manager.images_dir / f"{save_path.stem}_{int(time.time())}{save_path.suffix}"
            shutil.copy2(src_path, save_path)
            return None, manager.get_image_watermark_gallery(), build_gallery_meta()

        def save_text_watermark(text, font_size, color, opacity, name):
            if not text or not name:
                return "请输入水印文字和预设名称。", manager.get_text_watermark_gallery(), build_gallery_meta()
            payload = {"type": "text", "text": text, "font_size": font_size, "color": color, "opacity": opacity, "timestamp": time.time()}
            with open(manager.texts_dir / f"{name}.json", "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
            preview_path = manager.texts_dir / f"{name}_preview.png"
            if preview_path.exists():
                preview_path.unlink()
            return f"已保存文字水印：{name}", manager.get_text_watermark_gallery(), build_gallery_meta()
        def select_image_watermark(evt: gr.SelectData):
            images = manager.list_image_watermarks()
            if evt.index < len(images):
                path = images[evt.index]
                return f"已选择图片水印：{Path(path).stem}", json.dumps({"type": "image", "path": path, "ts": time.time()}, ensure_ascii=False)
            return "选择失败", ""

        def select_text_watermark(evt: gr.SelectData):
            texts = manager.list_text_watermarks()
            if evt.index < len(texts):
                data = texts[evt.index]
                return (
                    f"已选择文字水印：{data.get('text', '?')}",
                    json.dumps({
                        "type": "text",
                        "text": data.get("text", ""),
                        "font_size": data.get("font_size", 48),
                        "color": data.get("color", "#FFFFFF"),
                        "opacity": data.get("opacity", 1.0),
                        "ts": time.time(),
                    }, ensure_ascii=False),
                )
            return "选择失败", ""

        def select_shape_watermark(color, fill_mode, blur_size, mosaic_size, feather, evt: gr.SelectData):
            if evt.index < len(SHAPE_TYPES):
                shape_key, shape_name = SHAPE_TYPES[evt.index]
                payload = {
                    "type": "shape",
                    "shape": shape_key,
                    "color": color,
                    "fill_mode": fill_mode,
                    "blur_size": blur_size,
                    "mosaic_size": mosaic_size,
                    "feather": feather,
                    "ts": time.time(),
                }
                return f"已选择形状水印：{shape_name}", json.dumps(payload, ensure_ascii=False)
            return "选择失败", ""

        def deselect_watermark():
            return (
                "已取消左侧水印选择",
                json.dumps({"type": None, "ts": time.time()}, ensure_ascii=False),
                gr.update(value=manager.get_image_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_text_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_shape_watermark_gallery(), selected_index=None),
                -1,
                -1,
            )

        def clear_library_selection_on_tab_change():
            return (
                "已清除当前水印选择",
                json.dumps({"type": None, "ts": time.time()}, ensure_ascii=False),
                gr.update(value=manager.get_image_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_text_watermark_gallery(), selected_index=None),
                gr.update(value=manager.get_shape_watermark_gallery(), selected_index=None),
                -1,
                -1,
            )

        def format_watermark_list(wm_list):
            if not wm_list:
                return "尚未添加水印。"
            lines = []
            for index, wm in enumerate(wm_list, start=1):
                if wm["type"] == "text":
                    lines.append(f"[{index}] 文字“{wm.get('text', '')}” 位置({wm['x']:.0%}, {wm['y']:.0%}) 大小={int(wm.get('size', 0))} 不透明度={wm.get('opacity', 1.0):.0%}")
                elif wm["type"] == "image":
                    image_name = Path(wm.get("path", "")).stem if wm.get("path") else "?"
                    lines.append(f"[{index}] 图片“{image_name}” 位置({wm['x']:.0%}, {wm['y']:.0%}) 大小={int(wm.get('size', 0))} 不透明度={wm.get('opacity', 1.0):.0%}")
                else:
                    fill_name = _shape_fill_name(wm.get("fill_mode", "color"))
                    lines.append(f"[{index}] 形状“{_shape_name(wm.get('shape'))}” 位置({wm['x']:.0%}, {wm['y']:.0%}) 模式={fill_name} 大小={int(wm.get('size', 0))} 不透明度={wm.get('opacity', 1.0):.0%}")
            return "\n".join(lines)

        def add_watermark_at_position(coords_json, bridge_json, wm_list, size, rotation, opacity):
            if not coords_json:
                return wm_list, format_watermark_list(wm_list)
            try:
                coords = json.loads(coords_json)
            except Exception:
                return wm_list, format_watermark_list(wm_list)
            try:
                wm_data = json.loads(bridge_json) if bridge_json else {}
            except Exception:
                wm_data = {}
            if not wm_data or not wm_data.get("type"):
                return wm_list, format_watermark_list(wm_list)
            new_wm = {
                "type": wm_data["type"],
                "x": _clamp_ratio(coords.get("x", 0.5)),
                "y": _clamp_ratio(coords.get("y", 0.5)),
                "size": float(size),
                "rotation": float(rotation),
                "opacity": float(opacity),
                "img_width": coords.get("imgWidth", 0),
                "img_height": coords.get("imgHeight", 0),
            }
            if new_wm["type"] == "text":
                new_wm["text"] = wm_data.get("text", "水印")
                new_wm["color"] = wm_data.get("color", "#FFFFFF")
                new_wm["font_size"] = wm_data.get("font_size", 48)
            elif new_wm["type"] == "image":
                new_wm["path"] = wm_data.get("path", "")
            elif new_wm["type"] == "shape":
                new_wm["shape"] = wm_data.get("shape", "square")
                new_wm["fill_mode"] = coords.get("fillMode", wm_data.get("fill_mode", "color"))
                new_wm["color"] = coords.get("color", wm_data.get("color", "#FFFFFF"))
                new_wm["blur_size"] = float(coords.get("blurSize", wm_data.get("blur_size", 16)))
                new_wm["mosaic_size"] = float(coords.get("mosaicSize", wm_data.get("mosaic_size", 18)))
                new_wm["feather"] = float(coords.get("feather", wm_data.get("feather", 8)))
                if coords.get("shapeW") and coords.get("shapeH"):
                    new_wm["shape_w"] = max(4, float(coords.get("shapeW", size)))
                    new_wm["shape_h"] = max(4, float(coords.get("shapeH", size)))
                    new_wm["size"] = min(new_wm["shape_w"], new_wm["shape_h"])
            wm_list = list(wm_list or []) + [new_wm]
            return wm_list, format_watermark_list(wm_list)

        def process_edit_event(event_json, wm_list):
            wm_list = list(wm_list or [])
            if not event_json:
                return wm_list, format_watermark_list(wm_list)
            try:
                event = json.loads(event_json)
            except Exception:
                return wm_list, format_watermark_list(wm_list)
            action = event.get("action")
            index = int(event.get("index", -1))
            if action in {"update_existing", "existing_resize", "existing_rotate"} and 0 <= index < len(wm_list):
                payload = event.get("watermark") or {}
                payload["x"] = _clamp_ratio(payload.get("x", wm_list[index].get("x", 0.5)))
                payload["y"] = _clamp_ratio(payload.get("y", wm_list[index].get("y", 0.5)))
                wm_list[index] = payload
            elif action == "delete_existing" and 0 <= index < len(wm_list):
                wm_list.pop(index)
            return wm_list, format_watermark_list(wm_list)

        def undo_watermark(wm_list):
            wm_list = list(wm_list or [])
            if wm_list:
                wm_list.pop()
            return wm_list, format_watermark_list(wm_list)

        def clear_watermarks():
            return [], "尚未添加水印。"

        def clear_image():
            return None, None, [], "尚未添加水印。"

        def generate_watermarked(img, wm_list, auto_save):
            if img is None:
                return None, "请先上传图片或获取最近图片。"
            manager.original_image = img.copy()
            wm_list = list(wm_list or [])
            result = manager.apply_watermark_to_image(img, wm_list)
            message = "未添加水印，已生成原图副本。" if not wm_list else f"已生成带水印图片，共 {len(wm_list)} 个水印。"
            if auto_save:
                output_dir = _get_output_dir()
                base_name = _make_base_name()
                normal_path = output_dir / f"{base_name}.png"
                result.save(normal_path)
                extract_path = output_dir / f"extractable_{base_name}.png"
                manager.create_extractable_image(result, manager.original_image, extract_path)
                message += f" 已保存到 {normal_path} 和 {extract_path}。"
            return result, message

        def save_normal(img, browser_dl):
            if img is None:
                return "没有可保存的图片。", ""
            path = _get_output_dir() / f"{_make_base_name()}.png"
            img.save(path)
            return f"已保存：{path}", str(path) if browser_dl else ""

        def save_extractable(img, browser_dl):
            if img is None or manager.original_image is None:
                return "请先生成图片。", ""
            path = _get_output_dir() / f"extractable_{_make_base_name()}.png"
            manager.create_extractable_image(img, manager.original_image, path)
            return f"已保存可解压包：{path}", str(path) if browser_dl else ""
        def fetch_last_image():
            webui_root = Path(__file__).parent.parent.parent.parent
            search_dirs = [
                webui_root / "outputs" / "txt2img-images",
                webui_root / "outputs" / "img2img-images",
                webui_root / "outputs" / "txt2img-grids",
                webui_root / "outputs" / "img2img-grids",
                webui_root / "outputs" / "extras-images",
                webui_root / "outputs",
            ]
            latest_file = None
            latest_mtime = 0
            excluded = webui_root / "outputs" / "watermarked"
            for search_dir in search_dirs:
                if not search_dir.exists():
                    continue
                for pattern in ["*.png", "*.jpg", "*.jpeg", "*.webp"]:
                    for file_path in search_dir.rglob(pattern):
                        try:
                            file_path.relative_to(excluded)
                            continue
                        except ValueError:
                            pass
                        try:
                            mtime = file_path.stat().st_mtime
                        except Exception:
                            continue
                        if mtime > latest_mtime:
                            latest_mtime = mtime
                            latest_file = file_path
            if latest_file is None:
                return gr.update()
            try:
                return Image.open(latest_file)
            except Exception:
                return gr.update()

        def record_img_idx(evt: gr.SelectData):
            return evt.index

        def record_txt_idx(evt: gr.SelectData):
            return evt.index

        def do_delete_img_wm(idx):
            images = manager.list_image_watermarks()
            if 0 <= idx < len(images):
                path = Path(images[idx])
                if path.exists():
                    path.unlink()
                return f"已删除图片水印：{path.name}", gr.update(value=manager.get_image_watermark_gallery(), selected_index=None), -1, build_gallery_meta()
            return "请先选择图片水印。", gr.update(value=manager.get_image_watermark_gallery(), selected_index=None), -1, build_gallery_meta()

        def do_delete_txt_wm(idx):
            texts = manager.list_text_watermarks()
            if 0 <= idx < len(texts):
                data = texts[idx]
                json_path = Path(data["_path"])
                preview_path = manager.texts_dir / f"{data['_filename']}_preview.png"
                if json_path.exists():
                    json_path.unlink()
                if preview_path.exists():
                    preview_path.unlink()
                return f"已删除文字水印：{data['_filename']}", gr.update(value=manager.get_text_watermark_gallery(), selected_index=None), -1, build_gallery_meta()
            return "请先选择文字水印。", gr.update(value=manager.get_text_watermark_gallery(), selected_index=None), -1, build_gallery_meta()

        refresh_wm_btn.click(fn=refresh_galleries, outputs=[img_wm_gallery, txt_wm_gallery, shape_wm_gallery, gallery_meta_bridge])
        upload_img_wm.change(fn=auto_upload_image_watermark, inputs=[upload_img_wm], outputs=[upload_img_wm, img_wm_gallery, gallery_meta_bridge])
        save_txt_wm_btn.click(fn=save_text_watermark, inputs=[wm_text_input, wm_font_size, wm_text_color, wm_opacity_slider, wm_text_name], outputs=[wm_status, txt_wm_gallery, gallery_meta_bridge])
        img_wm_gallery.select(fn=select_image_watermark, outputs=[wm_status, selected_wm_bridge])
        txt_wm_gallery.select(fn=select_text_watermark, outputs=[wm_status, selected_wm_bridge])
        shape_wm_gallery.select(fn=select_shape_watermark, inputs=[shape_color, shape_mode_quick_value, shape_blur_quick, shape_mosaic_quick, shape_feather_editor], outputs=[wm_status, selected_wm_bridge])

        shape_mode_quick_color_tab.select(fn=lambda: _set_shape_mode("color"), outputs=[shape_mode_quick_value])
        shape_mode_quick_blur_tab.select(fn=lambda: _set_shape_mode("blur"), outputs=[shape_mode_quick_value])
        shape_mode_quick_mosaic_tab.select(fn=lambda: _set_shape_mode("mosaic"), outputs=[shape_mode_quick_value])

        deselect_wm_btn.click(fn=deselect_watermark, outputs=[wm_status, selected_wm_bridge, img_wm_gallery, txt_wm_gallery, shape_wm_gallery, selected_img_idx, selected_txt_idx], _js='() => { window.watermarkClearGallerySelectionVisual && window.watermarkClearGallerySelectionVisual(); }')
        img_tab.select(fn=clear_library_selection_on_tab_change, outputs=[wm_status, selected_wm_bridge, img_wm_gallery, txt_wm_gallery, shape_wm_gallery, selected_img_idx, selected_txt_idx], _js='() => { window.watermarkClearGallerySelectionVisual && window.watermarkClearGallerySelectionVisual(); }')
        txt_tab.select(fn=clear_library_selection_on_tab_change, outputs=[wm_status, selected_wm_bridge, img_wm_gallery, txt_wm_gallery, shape_wm_gallery, selected_img_idx, selected_txt_idx], _js='() => { window.watermarkClearGallerySelectionVisual && window.watermarkClearGallerySelectionVisual(); }')
        shape_tab.select(fn=clear_library_selection_on_tab_change, outputs=[wm_status, selected_wm_bridge, img_wm_gallery, txt_wm_gallery, shape_wm_gallery, selected_img_idx, selected_txt_idx], _js='() => { window.watermarkClearGallerySelectionVisual && window.watermarkClearGallerySelectionVisual(); }')
        img_wm_gallery.select(fn=record_img_idx, outputs=[selected_img_idx])
        txt_wm_gallery.select(fn=record_txt_idx, outputs=[selected_txt_idx])
        delete_img_wm_btn.click(fn=do_delete_img_wm, inputs=[selected_img_idx], outputs=[wm_status, img_wm_gallery, selected_img_idx, gallery_meta_bridge])
        delete_txt_wm_btn.click(fn=do_delete_txt_wm, inputs=[selected_txt_idx], outputs=[wm_status, txt_wm_gallery, selected_txt_idx, gallery_meta_bridge])
        click_coords.change(fn=add_watermark_at_position, inputs=[click_coords, selected_wm_bridge, watermark_list_state, wm_size_slider, wm_rotation_slider, wm_opacity_slider], outputs=[watermark_list_state, watermark_info])
        edit_bridge.change(fn=process_edit_event, inputs=[edit_bridge, watermark_list_state], outputs=[watermark_list_state, watermark_info])
        undo_btn.click(fn=undo_watermark, inputs=[watermark_list_state], outputs=[watermark_list_state, watermark_info], _js='() => { window.watermarkUndo && window.watermarkUndo(); }')
        delete_selected_btn.click(fn=lambda: None, _js='() => { window.watermarkDeleteSelected && window.watermarkDeleteSelected(); }')
        clear_wm_btn.click(fn=clear_watermarks, outputs=[watermark_list_state, watermark_info], _js='() => { window.watermarkClearAll && window.watermarkClearAll(); }')
        clear_btn.click(fn=clear_image, outputs=[image_editor, preview_image, watermark_list_state, watermark_info], _js='() => { window.watermarkClearAll && window.watermarkClearAll(); window.watermarkRemoveCanvas && window.watermarkRemoveCanvas(); }')
        fetch_last_btn.click(fn=fetch_last_image, outputs=[image_editor])
        generate_btn.click(fn=generate_watermarked, inputs=[image_editor, watermark_list_state, auto_save_toggle], outputs=[preview_image, save_status])
        save_btn.click(fn=save_normal, inputs=[preview_image, browser_download_toggle], outputs=[save_status, download_path_bridge])
        save_extract_btn.click(fn=save_extractable, inputs=[preview_image, browser_download_toggle], outputs=[save_status, download_path_bridge])
        watermark_tab.load(fn=refresh_galleries, outputs=[img_wm_gallery, txt_wm_gallery, shape_wm_gallery, gallery_meta_bridge])

    return [(watermark_tab, "水印添加", "watermark_adder_tab")]


script_callbacks.on_ui_tabs(on_ui_tabs)


