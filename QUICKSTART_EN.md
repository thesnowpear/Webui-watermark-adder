# Quick Start Guide

## Installation

### 1. Locate the WebUI Forge extensions directory

```
stable-diffusion-webui-forge/extensions/
```

### 2. Clone or copy this project

**Method A: Using Git**
```bash
cd stable-diffusion-webui-forge/extensions/
git clone <repository-url> sd-webui-watermark-adder
```

**Method B: Manual copy**

Copy the entire project folder into the `extensions` directory.

### 3. Restart WebUI Forge

Close and restart WebUI Forge, then find the **Watermark Adder** tab in the top tab bar.

## Interface Layout

The interface is divided into three panels:

| Left: Watermark Library | Center: Editor | Right: Preview & Save |
|:---|:---|:---|
| Image/text/shape watermark management | Image editing and watermark placement | Generate preview and save image |
| Upload, delete, select | Zoom, pan, shortcuts | Normal save / Extractable pack |

## Tutorial

### Step 1: Upload an Image

- Drag and drop or click to upload an image in the editor
- Or click **Fetch Last Image** (automatically scans `outputs/` for the latest image, excluding the watermarked output directory)

### Step 2: Create or Select a Watermark

**Create a text watermark:**
1. Switch to the "Text Watermark" tab
2. Enter the watermark text
3. Adjust font size and color
4. Enter a watermark name and click "Save"

**Upload an image watermark:**
1. Switch to the "Image Watermark" tab
2. Drag and drop or click to upload a watermark image (PNG with transparent background recommended)
3. The watermark is automatically saved to the library after upload

**Create a shape watermark:**
1. Switch to the "Shape Watermark" tab
2. Choose the shape and effect mode: `color`, `blur`, or `mosaic`
3. Adjust feather and mode controls

### Step 3: Add Watermarks to the Image

1. Click a watermark in the library to select it
2. Move your mouse over the editor to preview
3. For text/image watermarks: **left-click** to place
4. For shape watermarks: **left-drag** to draw
5. Repeat to add multiple watermarks

### Step 4: Edit Existing Watermarks

1. Click an existing watermark on the canvas to select it
2. Drag the watermark to move it
3. Drag the corner/edge handles to resize it
4. Hold **Shift** while resizing to toggle aspect ratio lock

### Step 5: Browse the Image

- **Scroll wheel**: Zoom image
- **Left-drag**: Pan image
- **Space + Left-drag**: Pan image
- **Double-click**: Reset zoom and pan

### Step 6: Generate and Save

1. Click **Generate Watermarked Image** (auto-saved to `outputs/watermarked/` by default)
2. Preview the result on the right
3. Choose a save method:
   - **Save Image**: Save as a standard PNG
   - **Save Extractable Pack**: Save as a special extractable format

## Extractable Image Pack

This is a special feature. The generated file:
- Appears as a normal PNG image (watermarked version)
- Rename the file extension from `.png` to `.zip` and open it with any archive tool to retrieve the original unwatermarked image

**How to extract:**
```bash
# Windows
ren extractable_1234567890.png extractable_1234567890.zip

# Linux/Mac
mv extractable_1234567890.png extractable_1234567890.zip

# Extract
unzip extractable_1234567890.zip
# Outputs: original_image.png
```

## Keyboard Shortcuts

| Action | Shortcut |
|:---|:---|
| Zoom image | Scroll wheel |
| Pan image | Left-drag |
| Pan image | Space + Left-drag |
| Reset view | Double-click |
| Adjust watermark size | Ctrl + Scroll (±20px) |
| Adjust rotation angle | Shift + Scroll |
| Adjust opacity | Alt + Scroll |
| Place watermark | Left-click |

## FAQ

### Q: Why can't I see the Watermark Adder tab?
Make sure the project is placed in the `extensions` directory, WebUI Forge has been restarted, and check the console for any errors.

### Q: Large images show a black screen when loading?
The extension will automatically retry and wait for the image to finish decoding (up to ~9 seconds). If the image is very large, please wait patiently or resize it before uploading.

### Q: Where are saved images stored?
Images are saved by default to `outputs/watermarked/` under the WebUI root directory.

### Q: Watermark text shows as squares/boxes?
The system is missing the required font and will fall back to the default font automatically. Consider using an image watermark instead.

## License

MIT License

## March 2026 Notes

- Shape watermarks use an exclusive `color / blur / mosaic` mode
- The center editor switches by selected watermark type and exposes text content plus shape feather/effect controls
- Generating without any watermark is now allowed and returns an unchanged image copy
- Shape mode selection uses library tabs, while the editor only reveals the matching control for the selected shape
