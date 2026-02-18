#!/usr/bin/env python3
"""Generate retrowave-style splash icons for PWA manifest."""

from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ICON_DIR = "/Users/persjo/code/springa/public"
SIZES = [192, 512]


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def extract_logo(icon_path, target_size):
    """Extract the bright S logo from the icon, removing the dark background."""
    img = Image.open(icon_path).convert("RGBA")
    arr = np.array(img, dtype=np.float32)

    # Calculate brightness (max of RGB channels to catch neon colors)
    brightness = np.max(arr[:, :, :3], axis=2)

    # The S logo is the bright neon part — threshold to extract it
    # Use a gradient: pixels brighter than 80 start becoming visible,
    # fully opaque above 140
    low, high = 70, 150
    alpha = np.clip((brightness - low) / (high - low), 0, 1)

    # Boost alpha for very bright pixels (the logo lines)
    alpha = alpha ** 0.7  # slightly more aggressive extraction

    # Apply new alpha while keeping original RGB
    result = arr.copy()
    result[:, :, 3] = alpha * 255

    logo = Image.fromarray(result.astype(np.uint8))
    logo = logo.resize((target_size, target_size), Image.LANCZOS)
    return logo


def draw_retrowave(size):
    """Draw a retrowave grid background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # Sky gradient
    sky_stops = [
        (0.0, (13, 10, 26)),
        (0.35, (18, 12, 34)),
        (0.55, (28, 14, 55)),
        (0.75, (40, 15, 72)),
        (1.0, (52, 16, 88)),
    ]
    horizon_y = int(size * 0.58)
    for y in range(horizon_y):
        t = y / max(horizon_y, 1)
        for i in range(len(sky_stops) - 1):
            if sky_stops[i][0] <= t <= sky_stops[i + 1][0]:
                lt = (t - sky_stops[i][0]) / (sky_stops[i + 1][0] - sky_stops[i][0])
                color = lerp_color(sky_stops[i][1], sky_stops[i + 1][1], lt)
                draw.line([(0, y), (size, y)], fill=color + (255,))
                break

    # Floor base gradient
    for y in range(horizon_y, size):
        t = (y - horizon_y) / max(size - horizon_y, 1)
        color = lerp_color((40, 12, 65), (13, 10, 26), t * 0.6)
        draw.line([(0, y), (size, y)], fill=color + (255,))

    # Grid overlay
    grid_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid_layer)
    pink = (255, 45, 149)
    vanish_x = size // 2
    floor_height = size - horizon_y

    # Horizontal lines — exponential spacing for perspective
    n_horiz = 20
    for i in range(n_horiz):
        t = i / n_horiz
        y = horizon_y + int(floor_height * (t ** 1.6))
        alpha = int(25 + 55 * t)
        gd.line([(0, y), (size, y)], fill=pink + (alpha,), width=1)

    # Vertical lines — converge to vanishing point
    n_vert = 17
    for i in range(n_vert):
        frac = i / (n_vert - 1)
        x_bottom = int(vanish_x + (frac - 0.5) * size * 2.2)
        alpha = int(25 + 30 * (1 - abs(frac - 0.5) * 2))
        gd.line([(vanish_x, horizon_y), (x_bottom, size)],
                fill=pink + (alpha,), width=1)

    img = Image.alpha_composite(img, grid_layer)

    # Horizon glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    margin = int(size * 0.05)
    for offset in range(-4, 5):
        a = max(0, 140 - abs(offset) * 35)
        glow_draw.line(
            [(margin, horizon_y + offset), (size - margin, horizon_y + offset)],
            fill=(255, 45, 149, a), width=1,
        )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, size // 120)))
    img = Image.alpha_composite(img, glow)

    # Radial glow behind logo area
    glow2 = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = size // 2, int(size * 0.40)
    radius = int(size * 0.35)
    for r in range(radius, 0, -2):
        t = r / radius
        a = int(40 * (1 - t) ** 2)
        c = lerp_color((255, 45, 149), (180, 50, 200), t)
        ImageDraw.Draw(glow2).ellipse(
            [cx - r, cy - r, cx + r, cy + r], fill=c + (a,)
        )
    glow2 = glow2.filter(ImageFilter.GaussianBlur(radius=max(3, size // 80)))
    img = Image.alpha_composite(img, glow2)

    return img


def create_icon(size, maskable=False):
    bg = draw_retrowave(size)

    # Extract S logo from the original full-size icon
    logo_scale = 0.55 if maskable else 0.65
    logo_px = int(size * logo_scale)
    logo = extract_logo(f"/tmp/springa-icon-512-original.png", logo_px)

    # Add glow to logo
    logo_glow = logo.copy().filter(ImageFilter.GaussianBlur(radius=max(2, size // 100)))
    # Boost glow alpha
    glow_arr = np.array(logo_glow, dtype=np.float32)
    glow_arr[:, :, 3] = np.clip(glow_arr[:, :, 3] * 1.5, 0, 255)
    logo_glow = Image.fromarray(glow_arr.astype(np.uint8))

    x = (size - logo_px) // 2
    y = int(size * 0.40) - logo_px // 2

    bg = Image.alpha_composite(bg, paste_at(logo_glow, (x, y), size))
    bg = Image.alpha_composite(bg, paste_at(logo, (x, y), size))

    return bg.convert("RGB")


def paste_at(layer, pos, canvas_size):
    """Paste a layer at position onto a transparent canvas."""
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(layer, pos, layer)
    return canvas


def main():
    for size in SIZES:
        icon = create_icon(size, maskable=False)
        icon.save(f"{ICON_DIR}/icon-{size}.png", "PNG")
        print(f"  icon-{size}.png")

        icon_m = create_icon(size, maskable=True)
        icon_m.save(f"{ICON_DIR}/icon-{size}-maskable.png", "PNG")
        print(f"  icon-{size}-maskable.png")

    print("Done.")


if __name__ == "__main__":
    main()
