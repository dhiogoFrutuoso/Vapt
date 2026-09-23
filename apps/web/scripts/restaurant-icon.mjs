import sharp from 'sharp';

// One opaque, full-bleed square for Windows and legacy Android. Crop rather
// than stretch or letterbox non-square logos; preserve their original colors.
export async function renderRestaurantIcon(bytes, size = 512) {
  const input = sharp(bytes, { limitInputPixels: 16_000_000 }).rotate();
  const { dominant } = await input.clone().stats();
  return input.resize(size, size, { fit: 'cover', position: 'centre' })
    .flatten({ background: dominant }).png().toBuffer();
}

export async function renderAdaptiveRestaurantIcon(icon) {
  const { width } = await sharp(icon).metadata();
  // Android displays the central 72dp of a 108dp layer. Extend edge pixels
  // into the system's motion area so the logo stays intact with no white rim.
  const bleed = Math.round(width / 4);
  return sharp(icon).extend({ top: bleed, bottom: bleed, left: bleed, right: bleed, extendWith: 'copy' }).png().toBuffer();
}

// Android masks the artwork itself. Never inset it or add a white plate.
export const adaptiveIconXml = '<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/restaurant_icon"/><foreground android:drawable="@android:color/transparent"/></adaptive-icon>';
