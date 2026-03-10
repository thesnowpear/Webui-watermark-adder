# WebUI-Forge Watermark Adder Extension

[Chinese](README_CN.md)

A watermark extension for Stable Diffusion WebUI Forge with visual editing, real-time preview, and extractable image pack support.

## Features

- **Text watermarks**: Create and save custom text watermarks with color, size, and opacity controls
- **Image watermarks**: Upload and manage image watermarks (PNG with transparent background recommended)
- **Shape watermarks**: Square, rectangle, circle, ellipse with three exclusive effect modes: `color`, `blur`, `mosaic`
- **Feather**: Soft edge control for shape watermarks
- **Visual editing**: Canvas overlay with mouse-follow preview, click to place text/image, drag to draw shapes
- **Select and edit existing watermarks**: Move, resize, rotate, or delete directly on the canvas
- **Zoom and pan**: Scroll to zoom, drag to pan, double-click to reset
- **Shortcut controls**:
  - Scroll wheel: Zoom image
  - Left-drag: Pan image
  - Space + Left-drag: Pan image
  - Double-click: Reset view
  - Ctrl + Scroll: Adjust watermark size (±20px)
  - Shift + Scroll: Adjust rotation angle
  - Alt + Scroll: Adjust opacity
- **Undo / Clear**: Undo the last watermark or clear all
- **Dual save modes**:
  - Normal save: Standard PNG with watermarks
  - Extractable pack: PNG file that can be renamed to `.zip` to extract the original unwatermarked image
- **Auto save**: Auto-save to `outputs/watermarked/` is enabled by default when generating
- **Fetch last image**: Automatically scan `outputs/` for the latest generated image (excludes `outputs/watermarked/`)
- **Generate without watermarks**: If no watermark is added, output is the original image copy

## Installation

1. Navigate to your WebUI Forge `extensions` directory
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/sd-webui-watermark-adder.git
   ```
3. Restart WebUI Forge

## Usage

1. Open the **Watermark Adder** tab (top-level, same level as txt2img/img2img)
2. Upload an image, or click **Fetch Last Image** to load from `outputs/`
3. Create or select a watermark from the library (left panel)
4. Move your mouse over the editor to preview
5. Click to place a text or image watermark
6. Drag to draw a shape watermark
7. Click existing watermarks to edit; drag handles to resize, rotate, or move
8. Click **Generate** to render the final image (auto-saved to `outputs/watermarked/` by default)

## Editing Tips

- Hold **Shift** while resizing to toggle aspect ratio lock
- Shape blur controls blur intensity
- Shape mosaic controls the pixel block size for each tile
- During zoom or drag, preview temporarily switches to a lighter render for smoother interaction, and refreshes to full quality after you stop

## Tech Stack

- Python 3.x + Gradio
- Pillow (PIL)
- JavaScript + HTML5 Canvas
- Polyglot file (PNG + ZIP)

## License

MIT License

## 2026-03 Update

- Shape watermarks now support three exclusive effect modes: `color`, `blur`, and `mosaic`
- Shape editor exposes `feather` plus the matching mode control: color, blur size, or mosaic size
- Text editor exposes the watermark text content for direct editing
- Clicking an existing watermark switches the editor panel by watermark type (image, text, shape)
- The top title was removed so the whole panel starts higher
- Generate now works even when no watermark has been added
- Shape mode selection stays in the library tabs; the editor only shows the control for the selected shape mode
