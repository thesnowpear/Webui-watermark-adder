from math import sqrt
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont


class WatermarkRenderer:
    def __init__(self):
        self._font_cache = {}
        self._image_cache = {}

    def _get_font(self, size):
        size = max(1, int(size))
        if size not in self._font_cache:
            try:
                self._font_cache[size] = ImageFont.truetype('arial.ttf', size)
            except Exception:
                self._font_cache[size] = ImageFont.load_default()
        return self._font_cache[size]

    def _get_image(self, path):
        if path not in self._image_cache:
            self._image_cache[path] = Image.open(path).convert('RGBA')
        return self._image_cache[path].copy()

    def _hex_to_rgba(self, color, opacity):
        if isinstance(color, str) and color.startswith('#') and len(color) >= 7:
            red = int(color[1:3], 16)
            green = int(color[3:5], 16)
            blue = int(color[5:7], 16)
        else:
            red, green, blue = 255, 255, 255
        alpha = int(255 * max(0.0, min(1.0, opacity)))
        return red, green, blue, alpha

    def _resolve_explicit_size(self, wm, scale_factor):
        draw_w = wm.get('draw_w')
        draw_h = wm.get('draw_h')
        if draw_w and draw_h:
            return max(1, int(float(draw_w) * scale_factor)), max(1, int(float(draw_h) * scale_factor))
        return None

    def _render_text(self, result, wm, center_x, center_y, scale_factor):
        size = max(1, int(wm.get('size', 100) * scale_factor))
        font = self._get_font(size)
        text = wm.get('text', '水印')
        red, green, blue, alpha = self._hex_to_rgba(wm.get('color', '#FFFFFF'), wm.get('opacity', 1.0))
        bbox = font.getbbox(text)
        width = bbox[2] - bbox[0] + 20
        height = bbox[3] - bbox[1] + 20
        text_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)
        draw.text((10 - bbox[0], 10 - bbox[1]), text, fill=(red, green, blue, alpha), font=font)

        explicit_size = self._resolve_explicit_size(wm, scale_factor)
        if explicit_size:
            text_layer = text_layer.resize(explicit_size, Image.BILINEAR)

        rotation = wm.get('rotation', 0)
        if rotation:
            text_layer = text_layer.rotate(-rotation, expand=True, resample=Image.BILINEAR)
        full_layer = Image.new('RGBA', result.size, (0, 0, 0, 0))
        full_layer.paste(text_layer, (center_x - text_layer.width // 2, center_y - text_layer.height // 2))
        return Image.alpha_composite(result, full_layer)

    def _render_image(self, result, wm, center_x, center_y, scale_factor):
        path = wm.get('path', '')
        if not path or not os.path.exists(path):
            return result
        image = self._get_image(path)
        explicit_size = self._resolve_explicit_size(wm, scale_factor)
        if explicit_size:
            draw_width, draw_height = explicit_size
        else:
            size = max(1.0, float(wm.get('size', 100)) * scale_factor)
            short_edge = min(image.width, image.height) or 1
            resize_scale = size / short_edge
            draw_width = max(1, int(image.width * resize_scale))
            draw_height = max(1, int(image.height * resize_scale))
        image = image.resize((draw_width, draw_height), Image.BILINEAR)
        opacity = max(0.0, min(1.0, float(wm.get('opacity', 1.0))))
        if opacity < 1.0:
            alpha = image.split()[3]
            alpha = alpha.point(lambda pixel: int(pixel * opacity))
            image.putalpha(alpha)
        rotation = wm.get('rotation', 0)
        if rotation:
            image = image.rotate(-rotation, expand=True, resample=Image.BILINEAR)
        full_layer = Image.new('RGBA', result.size, (0, 0, 0, 0))
        full_layer.paste(image, (center_x - image.width // 2, center_y - image.height // 2))
        return Image.alpha_composite(result, full_layer)

    def _shape_dimensions(self, wm, scale_factor):
        shape_width = wm.get('shape_w')
        shape_height = wm.get('shape_h')
        if shape_width and shape_height:
            return max(1, int(float(shape_width) * scale_factor)), max(1, int(float(shape_height) * scale_factor))
        size = max(1.0, float(wm.get('size', 100)) * scale_factor)
        shape_type = wm.get('shape', 'square')
        if shape_type in ('rectangle', 'ellipse'):
            return max(1, int(size * 1.6)), max(1, int(size))
        return max(1, int(size)), max(1, int(size))

    def _pixelate(self, image, block_size):
        block_size = max(1, int(round(block_size)))
        if block_size <= 1:
            return image
        small_w = max(1, int(round(image.width / block_size)))
        small_h = max(1, int(round(image.height / block_size)))
        reduced = image.resize((small_w, small_h), Image.BILINEAR)
        return reduced.resize(image.size, Image.NEAREST)

    def _create_shape_mask_patch(self, wm, draw_width, draw_height, feather_radius):
        diagonal = int(max(draw_width, draw_height, sqrt(draw_width * draw_width + draw_height * draw_height)))
        margin = int(max(12, feather_radius * 4 + 12))
        patch_size = diagonal + margin * 2
        patch = Image.new('L', (patch_size, patch_size), 0)
        draw = ImageDraw.Draw(patch)
        effective_w = max(2, int(round(draw_width - feather_radius * 2)))
        effective_h = max(2, int(round(draw_height - feather_radius * 2)))
        left = (patch_size - effective_w) // 2
        top = (patch_size - effective_h) // 2
        right = left + effective_w
        bottom = top + effective_h
        if wm.get('shape', 'square') in ('circle', 'ellipse'):
            draw.ellipse((left, top, right, bottom), fill=255)
        else:
            draw.rectangle((left, top, right, bottom), fill=255)
        if feather_radius > 0:
            patch = patch.filter(ImageFilter.GaussianBlur(max(0.1, feather_radius)))
        rotation = float(wm.get('rotation', 0) or 0)
        if rotation:
            patch = patch.rotate(-rotation, expand=False, resample=Image.BILINEAR)
        return patch

    def _compose_shape_mask(self, image_size, patch, center_x, center_y, opacity):
        full_mask = Image.new('L', image_size, 0)
        alpha_patch = patch.point(lambda pixel: int(pixel * opacity))
        left = center_x - alpha_patch.width // 2
        top = center_y - alpha_patch.height // 2
        full_mask.paste(alpha_patch, (left, top), alpha_patch)
        return full_mask

    def _render_shape(self, result, wm, center_x, center_y, scale_factor):
        draw_width, draw_height = self._shape_dimensions(wm, scale_factor)
        fill_mode = wm.get('fill_mode', 'color') or 'color'
        feather_radius = max(0.0, float(wm.get('feather', 0)) * scale_factor)
        blur_radius = max(0.0, float(wm.get('blur_size', 32)) * scale_factor)
        mosaic_size = max(1.0, float(wm.get('mosaic_size', 18)) * scale_factor)
        opacity = max(0.0, min(1.0, float(wm.get('opacity', 1.0))))

        mask_patch = self._create_shape_mask_patch(wm, draw_width, draw_height, feather_radius)
        mask = self._compose_shape_mask(result.size, mask_patch, center_x, center_y, opacity)

        if fill_mode == 'blur':
            content = result.filter(ImageFilter.GaussianBlur(max(0.1, blur_radius)))
        elif fill_mode == 'mosaic':
            content = self._pixelate(result, mosaic_size)
        else:
            red, green, blue, _ = self._hex_to_rgba(wm.get('color', '#FFFFFF'), 1.0)
            content = Image.new('RGBA', result.size, (red, green, blue, 255))

        return Image.composite(content, result, mask)

    def render(self, base_image, watermark_configs):
        if base_image is None:
            return None
        result = base_image.convert('RGBA')
        for wm in watermark_configs or []:
            x_ratio = float(wm.get('x', 0.5))
            y_ratio = float(wm.get('y', 0.5))
            image_width = float(wm.get('img_width', 0) or 0)
            scale_factor = result.width / image_width if image_width and image_width != result.width else 1.0
            center_x = int(max(0.0, min(1.0, x_ratio)) * result.width)
            center_y = int(max(0.0, min(1.0, y_ratio)) * result.height)
            wm_type = wm.get('type', 'text')
            if wm_type == 'text':
                result = self._render_text(result, wm, center_x, center_y, scale_factor)
            elif wm_type == 'image':
                result = self._render_image(result, wm, center_x, center_y, scale_factor)
            elif wm_type == 'shape':
                result = self._render_shape(result, wm, center_x, center_y, scale_factor)
        return result.convert('RGB')
