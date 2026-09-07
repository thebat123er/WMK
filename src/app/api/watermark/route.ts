import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// รองรับการอัปโหลดรูปขนาดใหญ่
export const runtime = "nodejs";
export const maxDuration = 30;

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

interface WatermarkOptions {
  scale: number;        // 0.05 - 0.5 (เทียบกับความกว้างรูปหลัก)
  opacity: number;      // 0.1 - 1.0
  position: Position;
  margin: number;       // ระยะขอบ (px)
  rotation: number;     // มุมหมุน (องศา)
  tile: boolean;        // true = ลายน้ำเต็มจอซ้อนกัน
}

// Logo options
interface LogoOptions {
  scale: number;        // 0.05 - 0.5
  opacity: number;      // 0.1 - 1.0
  position: Position;
  margin: number;       // px
  rotation: number;     // degrees
  tile: boolean;
}

// Text options
interface TextOptions {
  text: string;
  textColor: string;
  textSize: number;    // px
  fontFamily: string;
  opacity: number;     // 0.1 - 1.0
  position: Position;
  margin: number;      // px
  rotation: number;    // degrees
  tile: boolean;
}

function calculatePosition(
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

// Helper: สร้าง SVG text watermark (fallback เมื่อไม่มี logo)
function buildTextWatermarkSvg(text: string, fontSize: number, opacity: number, color: string, fontFamily: string): Buffer {
  const safe = text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
  <text
    x="50%"
    y="50%"
    font-family="${fontFamily}"
    font-size="${fontSize}"
    font-weight="bold"
    fill="${color}"
    fill-opacity="${opacity}"
    text-anchor="middle"
    dominant-baseline="middle"
  >${safe}</text>
</svg>`;
  return Buffer.from(svg);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image");
    const logoFile = formData.get("logo"); // optional

    if (!imageFile || !(imageFile instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์รูปภาพหลัก" }, { status: 400 });
    }

    // Logo options
    const logoScale = parseFloat((formData.get("logoScale") as string) ?? "0.22");
    const logoOpacity = parseFloat((formData.get("logoOpacity") as string) ?? "0.7");
    const logoPosition = ((formData.get("logoPosition") as Position) ?? "bottom-right") as Position;
    const logoMargin = parseInt((formData.get("logoMargin") as string) ?? "20", 10);
    const logoRotation = parseFloat((formData.get("logoRotation") as string) ?? "0");
    const logoTile = (formData.get("logoTile") as string) === "true";

    // Text options
    const textWatermark = (formData.get("text") as string) ?? "";
    const textColor = (formData.get("textColor") as string) ?? "#ffffff";
    const textSize = parseInt((formData.get("textSize") as string) ?? "48", 10);
    const textFontFamily = (formData.get("textFontFamily") as string) ?? "Arial, sans-serif";
    const textOpacity = parseFloat((formData.get("textOpacity") as string) ?? "0.7");
    const textPosition = ((formData.get("textPosition") as Position) ?? "bottom-right") as Position;
    const textMargin = parseInt((formData.get("textMargin") as string) ?? "20", 10);
    const textRotation = parseFloat((formData.get("textRotation") as string) ?? "0");
    const textTile = (formData.get("textTile") as string) === "true";

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

    // โหลดรูปหลักเพื่อเอาขนาด
    const mainMeta = await sharp(imageBuffer).metadata();
    const W = mainMeta.width ?? 0;
    const H = mainMeta.height ?? 0;
    if (!W || !H) {
      return NextResponse.json({ error: "ไม่สามารถอ่านขนาดรูปภาพได้" }, { status: 400 });
    }

    // เตรียม overlays
    const overlays: { input: Buffer; gravity?: string }[] = [];
    let composed = sharp(imageBuffer).ensureAlpha();

    // ----- เตรียม Logo overlay (ถ้ามี) -----
    if (logoFile && logoFile instanceof File && logoFile.size > 0) {
      const logoBuffer = Buffer.from(await logoFile.arrayBuffer());
      const logoMeta = await sharp(logoBuffer).metadata();
      const logoW = logoMeta.width ?? 100;
      const logoH = logoMeta.height ?? 100;

      const targetW = Math.max(20, Math.round(W * logoScale));
      const targetH = Math.max(20, Math.round((targetW * logoH) / logoW));

      // resize logo
      let resizedLogo = await sharp(logoBuffer)
        .resize(targetW, targetH, { fit: "inside" })
        .ensureAlpha()
        .toBuffer();

      // ปรับ opacity ด้วยการสร้าง alpha mask
      const resizedMeta = await sharp(resizedLogo).metadata();
      const rW = resizedMeta.width!;
      const rH = resizedMeta.height!;
      const alphaMask = await sharp({
        create: { width: rW, height: rH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: logoOpacity } },
      })
        .png()
        .toBuffer();

      resizedLogo = await sharp(resizedLogo)
        .composite([{ input: alphaMask, blend: "dest-in" }])
        .png()
        .toBuffer();

      // rotate
      if (logoRotation !== 0) {
        resizedLogo = await sharp(resizedLogo)
          .rotate(logoRotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
      }

      if (logoTile) {
        // วางซ้อนเต็มจอ (diagonal tile)
        const tileMeta = await sharp(resizedLogo).metadata();
        const tW = tileMeta.width!;
        const tH = tileMeta.height!;
        const stepX = Math.max(50, Math.round(tW * 1.2));
        const stepY = Math.max(50, Math.round(tH * 1.8));

        // สร้าง SVG ขนาด W x H ที่วาง logo ซ้ำ
        let tileMarkup = "";
        for (let y = -tH; y < H + tH; y += stepY) {
          for (let x = -tW; x < W + tW; x += stepX) {
            const encoded = `data:image/png;base64,${resizedLogo.toString("base64")}`;
            tileMarkup += `<image href="${encoded}" x="${x}" y="${y}" width="${tW}" height="${tH}" />`;
          }
        }
        const tileSvg = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${tileMarkup}</svg>`
        );
        const tiled = await sharp(tileSvg).png().toBuffer();
        composed = sharp(imageBuffer).composite([{ input: tiled, top: 0, left: 0 }]);
      } else {
        // วางตามตำแหน่ง
        const rotatedMeta = await sharp(resizedLogo).metadata();
        const fW = rotatedMeta.width!;
        const fH = rotatedMeta.height!;
        const { x, y } = calculatePosition(logoPosition, W, H, fW, fH, logoMargin);
        composed = sharp(imageBuffer).composite([{ input: resizedLogo, top: y, left: x }]);
      }
    }

    // ----- Text watermark (ถ้ามี) -----
    if (textWatermark.trim().length > 0) {
      // ประมาณความกว้างข้อความเพื่อคำนวณ scale
      const approxW = textWatermark.length * textSize * 0.55;
      const approxH = textSize * 1.3;
      const tW = Math.max(50, Math.round(approxW));
      const tH = Math.max(50, Math.round(approxH));

      let textSvg = buildTextWatermarkSvg(textWatermark, textSize, textOpacity, textColor, textFontFamily);
      let textPng = await sharp(textSvg).resize(tW, tH, { fit: "inside" }).png().toBuffer();

      if (textRotation !== 0) {
        textPng = await sharp(textPng)
          .rotate(textRotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
      }

      let textComposite;
      const textMeta = await sharp(textPng).metadata();
      const fW = textMeta.width!;
      const fH = textMeta.height!;

      if (textTile) {
        // วางข้อความซ้อนทั่วทั้งภาพ
        const stepX = Math.max(50, Math.round(fW * 1.2));
        const stepY = Math.max(50, Math.round(fH * 1.4));
        let tileMarkup = "";
        for (let y = -fH; y < H + fH; y += stepY) {
          for (let x = -fW; x < W + fW; x += stepX) {
            const encoded = `data:image/png;base64,${textPng.toString("base64")}`;
            tileMarkup += `<image href="${encoded}" x="${x}" y="${y}" width="${fW}" height="${fH}" />`;
          }
        }
        const tileSvg = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${tileMarkup}</svg>`
        );
        const tiledText = await sharp(tileSvg).png().toBuffer();
        textComposite = { input: tiledText, top: 0, left: 0 };
      } else {
        // วางตามตำแหน่ง
        const { x, y } = calculatePosition(textPosition, W, H, fW, fH, textMargin);
        textComposite = { input: textPng, top: y, left: x };
      }

      // composite text on top of current buffer
      const current = await composed.toBuffer();
      composed = sharp(current).composite([textComposite]);
    }

    // ----- Output -----
    const outFormat = (mainMeta.format ?? "jpeg") as string;
    let finalBuffer: Buffer;
    const baseName = (imageFile.name ?? "image").replace(/\.[^.]+$/, "");
    let contentType = "image/jpeg";
    let ext = "jpg";

    if (outFormat === "png") {
      finalBuffer = await composed.png().toBuffer();
      contentType = "image/png";
      ext = "png";
    } else if (outFormat === "webp") {
      finalBuffer = await composed.webp({ quality: 92 }).toBuffer();
      contentType = "image/webp";
      ext = "webp";
    } else {
      finalBuffer = await composed.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
      contentType = "image/jpeg";
      ext = "jpg";
    }

    return new NextResponse(new Uint8Array(finalBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${baseName}_watermarked.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Watermark API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}