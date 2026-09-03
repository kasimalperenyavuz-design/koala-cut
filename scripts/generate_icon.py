"""Generates a modern, iconic app.ico for koala-cut."""

from pathlib import Path
from PIL import Image, ImageDraw

def create_koala_icon(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = 8
    radius = 56

    # 1. Background Badge
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=radius,
        fill=(10, 15, 29, 255),  # Deep night navy
        outline=(16, 185, 129, 240),  # Emerald green border
        width=6,
    )

    # 2. Koala Ears (Fluffy outer circles)
    # Left Ear
    draw.ellipse([(26, 42), (92, 108)], fill=(148, 163, 184, 255))  # Slate 400
    draw.ellipse([(38, 54), (80, 96)], fill=(244, 114, 182, 230))   # Pink 400
    # Right Ear
    draw.ellipse([(164, 42), (230, 108)], fill=(148, 163, 184, 255))
    draw.ellipse([(176, 54), (218, 96)], fill=(244, 114, 182, 230))

    # 3. Koala Head
    draw.ellipse([(48, 68), (208, 218)], fill=(203, 213, 225, 255))  # Slate 300
    draw.ellipse([(58, 80), (198, 208)], fill=(226, 232, 240, 255))  # Slate 200

    # 4. Eyes
    draw.ellipse([(82, 114), (102, 134)], fill=(15, 23, 42, 255))
    draw.ellipse([(88, 118), (94, 124)], fill=(255, 255, 255, 255))  # Left eye shine

    draw.ellipse([(154, 114), (174, 134)], fill=(15, 23, 42, 255))
    draw.ellipse([(160, 118), (166, 124)], fill=(255, 255, 255, 255))  # Right eye shine

    # 5. Iconic Large Koala Nose (Dark Oval)
    draw.ellipse([(110, 124), (146, 172)], fill=(30, 41, 59, 255))   # Slate 800
    draw.ellipse([(118, 130), (130, 142)], fill=(71, 85, 105, 200))  # Nose highlight

    # 6. Scissors / Cut Accent Badge (Bottom Right)
    draw.ellipse([(172, 172), (236, 236)], fill=(16, 185, 129, 255))  # Emerald circle
    draw.ellipse([(176, 176), (232, 232)], fill=(6, 95, 70, 255))     # Deep emerald
    
    # Scissors Blades (Stylized X / Cut)
    draw.line([(188, 190), (220, 218)], fill=(255, 255, 255, 255), width=4)
    draw.line([(188, 218), (220, 190)], fill=(255, 255, 255, 255), width=4)
    draw.ellipse([(184, 186), (192, 194)], fill=(255, 255, 255, 255))
    draw.ellipse([(184, 214), (192, 222)], fill=(255, 255, 255, 255))

    # Save as multi-resolution ICO
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(
        output_path,
        format="ICO",
        sizes=sizes,
    )
    print(f"Successfully generated koala-cut icon at: {output_path}")

if __name__ == "__main__":
    assets_dir = Path(__file__).resolve().parent.parent / "assets"
    create_koala_icon(assets_dir / "app.ico")
