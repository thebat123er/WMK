"use client";

// Client-side watermark engine ใช้ Canvas API
// ใช้สำหรับพรีวิวแบบ real-time ก่อนส่งไปทำ server-side

export type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

// Logo-specific settings
export interface LogoConfig {
  scale: number;       // 0.05 - 0.5
  opacity: number;     // 0 - 1
  position: Position;
  margin: number;      // px
  rotation: number;    // degrees
  tile: boolean;
}

// Text-specific settings
export interface TextConfig {
  text: string;
  textColor: string;
  textSize: number;    // px
  fontFamily: string;
  opacity: number;     // 0 - 1
  position: Position;
  margin: number;      // px
  rotation: number;    // degrees
  tile: boolean;
}

// Combined config for backward compatibility
export interface WatermarkConfig {
  logo: LogoConfig;
  text: TextConfig;
}

export const defaultLogoConfig: LogoConfig = {
  scale: 0.22,
  opacity: 0.7,
  position: "bottom-right",
  margin: 20,
  rotation: 0,
  tile: false,
};

export const defaultTextConfig: TextConfig = {
  text: "",
  textColor: "#ffffff",
  textSize: 48,
  fontFamily: "Arial, sans-serif",
  opacity: 0.7,
  position: "bottom-right",
  margin: 20,
  rotation: 0,
  tile: false,
};

export const defaultConfig: WatermarkConfig = {
  logo: defaultLogoConfig,
  text: defaultTextConfig,
};

interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  logoImg: HTMLImageElement | null;
  config: WatermarkConfig;
}

function calcPos(
  pos: Position,
  W: number,
  H: number,
  wL: number,
  hL: number,
  margin: number
): { x: number; y: number } {
  switch (pos) {
    case "top-left":
      return { x: margin, y: margin };
    case "top-right":
      return { x: W - wL - margin, y: margin };
    case "bottom-left":
      return { x: margin, y: H - hL - margin };
    case "bottom-right":
      return { x: W - wL - margin, y: H - hL - margin };
    case "center":
      return { x: Math.round((W - wL) / 2), y: Math.round((H - hL) / 2) };
  }
}

export function drawWatermark({ ctx, W, H, logoImg, config }: DrawArgs): void {
  const { logo, text } = config;

  ctx.save();
  ctx.globalAlpha = 1;

  // ---- Logo ----
  if (logoImg) {
    const targetW = Math.max(20, W * logo.scale);
    const ratio = logoImg.naturalHeight / logoImg.naturalWidth || 1;
    const targetH = targetW * ratio;

    if (logo.tile) {
      const stepX = Math.max(50, targetW * 1.2);
      const stepY = Math.max(50, targetH * 1.8);
      ctx.globalAlpha = logo.opacity;
      for (let y = -targetH; y < H + targetH; y += stepY) {
        for (let x = -targetW; x < W + targetW; x += stepX) {
          ctx.save();
          ctx.translate(x + targetW / 2, y + targetH / 2);
          if (logo.rotation) ctx.rotate((logo.rotation * Math.PI) / 180);
          ctx.drawImage(logoImg, -targetW / 2, -targetH / 2, targetW, targetH);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    } else {
      const { x, y } = calcPos(logo.position, W, H, targetW, targetH, logo.margin);
      ctx.save();
      ctx.translate(x + targetW / 2, y + targetH / 2);
      if (logo.rotation) ctx.rotate((logo.rotation * Math.PI) / 180);
      ctx.globalAlpha = logo.opacity;
      ctx.drawImage(logoImg, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ---- Text ----
  if (text.text && text.text.trim().length > 0) {
    ctx.save();
    ctx.font = `bold ${text.textSize}px ${text.fontFamily || "Arial, sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // shadow ช่วยให้อ่านได้ทั้งรูปสว่าง/มืด
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    const metrics = ctx.measureText(text.text);
    const wL = metrics.width + 20;
    const hL = text.textSize * 1.4;
    const { x, y } = calcPos(text.position, W, H, wL, hL, text.margin);

    ctx.globalAlpha = text.opacity;
    ctx.translate(x + wL / 2, y + hL / 2);
    if (text.rotation) ctx.rotate((text.rotation * Math.PI) / 180);
    ctx.fillStyle = text.textColor;
    ctx.fillText(text.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

// Load HTMLImageElement จาก File หรือ URL
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
