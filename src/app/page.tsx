"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  WatermarkConfig,
  defaultConfig,
  drawWatermark,
  loadImage,
  fileToDataURL,
  Position,
  LogoConfig,
  TextConfig,
} from "@/lib/watermark";

type Mode = "logo" | "text" | "both";

// Available fonts for text watermark
const AVAILABLE_FONTS = [
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Courier New, monospace", label: "Courier New" },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: "Comic Sans MS, cursive", label: "Comic Sans" },
  { value: "Trebuchet MS, sans-serif", label: "Trebuchet" },
  { value: "Palatino Linotype, serif", label: "Palatino" },
];

export default function WatermarkPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [config, setConfig] = useState<WatermarkConfig>(defaultConfig);
  const [mode, setMode] = useState<Mode>("both");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
  }, [imageUrl, logoUrl]);

  // Handle image file selection
  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    const url = URL.createObjectURL(file);
    setImageFile(file);
    setImageUrl(url);
  }, []);

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    const url = URL.createObjectURL(file);
    setLogoFile(file);
    setLogoUrl(url);
  }, []);

  // Load image into memory when URL changes
  useEffect(() => {
    if (!imageUrl) return;
    loadImage(imageUrl)
      .then((img) => {
        mainImgRef.current = img;
      })
      .catch(() => {
        mainImgRef.current = null;
      });
  }, [imageUrl]);

  useEffect(() => {
    if (!logoUrl) {
      logoImgRef.current = null;
      return;
    }
    loadImage(logoUrl)
      .then((img) => {
        logoImgRef.current = img;
      })
      .catch(() => {
        logoImgRef.current = null;
      });
  }, [logoUrl]);

  // Render canvas preview
  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = mainImgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxW = canvas.parentElement?.clientWidth ?? 640;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const W = Math.round(img.naturalWidth * scale);
    const H = Math.round(img.naturalHeight * scale);

    canvas.width = W;
    canvas.height = H;

    ctx.drawImage(img, 0, 0, W, H);

    drawWatermark({
      ctx,
      W,
      H,
      logoImg: mode !== "text" ? logoImgRef.current : null,
      config: config,
    });
  }, [config, logoUrl, mode]);

  // Re-render when inputs change
  useEffect(() => {
    if (mainImgRef.current) renderPreview();
  }, [renderPreview]);

  // Update logo config
  const updateLogo = <K extends keyof LogoConfig>(key: K, value: LogoConfig[K]) => {
    setConfig((c) => ({ ...c, logo: { ...c.logo, [key]: value } }));
  };

  // Update text config
  const updateText = <K extends keyof TextConfig>(key: K, value: TextConfig[K]) => {
    setConfig((c) => ({ ...c, text: { ...c.text, [key]: value } }));
  };

  // Process & download
  const handleDownload = async () => {
    if (!imageFile) return;
    setIsProcessing(true);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      if (logoFile && mode !== "text") fd.append("logo", logoFile);

      // Logo settings
      fd.append("logoScale", config.logo.scale.toString());
      fd.append("logoOpacity", config.logo.opacity.toString());
      fd.append("logoPosition", config.logo.position);
      fd.append("logoMargin", config.logo.margin.toString());
      fd.append("logoRotation", config.logo.rotation.toString());
      fd.append("logoTile", config.logo.tile.toString());

      // Text settings
      if (mode !== "logo") {
        fd.append("text", config.text.text);
        fd.append("textColor", config.text.textColor);
        fd.append("textSize", config.text.textSize.toString());
        fd.append("textFontFamily", config.text.fontFamily);
        fd.append("textOpacity", config.text.opacity.toString());
        fd.append("textPosition", config.text.position);
        fd.append("textMargin", config.text.margin.toString());
        fd.append("textRotation", config.text.rotation.toString());
        fd.append("textTile", config.text.tile.toString());
      }

      const res = await fetch("/api/watermark", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "watermarked.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("เกิดข้อผิดพลาด: " + (e instanceof Error ? e.message : "ไม่ทราบสาเหตุ"));
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag & drop handlers
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  const POSITIONS: { value: Position; label: string }[] = [
    { value: "top-left", label: "⬚ บน-ซ้าย" },
    { value: "top-right", label: "⬚ บน-ขวา" },
    { value: "bottom-left", label: "⬚ ล่าง-ซ้าย" },
    { value: "bottom-right", label: "⬚ ล่าง-ขวา" },
    { value: "center", label: "⊙ กลาง" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💧</span>
            <h1 className="text-xl font-bold tracking-tight">
              Watermark<span className="text-cyan-400">J&Ohm</span>
            </h1>
          </div>
          <span className="text-xs text-slate-400"></span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Upload Section */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          {/* Main Image */}
          <div>
            <label className="mb-2 block text-2xl font-medium text-slate-300">รูปภาพหลัก</label>
            {!imageFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById("imageInput")?.click()}
                className={`flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all ${
                  isDragOver
                    ? "border-cyan-400 bg-cyan-400/10"
                    : "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
                }`}
              >
                <span className="text-4xl">📷</span>
                <p className="text-lg text-slate-400">
                  ลากไฟล์มาวาง หรือ <span className="text-cyan-400">คลิกเลือกไฟล์</span>
                </p>
                <p className="text-sm text-slate-500">รองรับ JPG, PNG, WebP</p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-slate-700">
                <img
                  src={imageUrl}
                  alt="preview"
                  className="h-48 w-full object-contain bg-slate-800"
                />
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImageUrl("");
                    mainImgRef.current = null;
                  }}
                  className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-xs hover:bg-red-500"
                >
                  ✕
                </button>
                <p className="truncate px-3 py-2 text-xs text-slate-400">{imageFile.name}</p>
              </div>
            )}
            <input
              id="imageInput"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
            />
          </div>

          {/* Logo */}
          <div>
            <label className="mb-2 block text-2xl font-medium text-slate-300">โลโก้ (ถ้ามี)</label>
            {!logoFile ? (
              <div
                onClick={() => document.getElementById("logoInput")?.click()}
                className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-800/50 transition-all hover:border-slate-500 hover:bg-slate-800"
              >
                <span className="text-4xl">🎨</span>
                <p className="text-lg text-slate-400">
                  คลิกเลือก<span className="text-cyan-400"> ไฟล์โลโก้ PNG</span>
                </p>
                <p className="text-sm text-slate-500">แนะนำ: PNG โปร่งแสง</p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-slate-700">
                <img
                  src={logoUrl}
                  alt="logo preview"
                  className="h-48 w-full object-contain bg-slate-800 p-4"
                />
                <button
                  onClick={() => {
                    setLogoFile(null);
                    setLogoUrl("");
                    logoImgRef.current = null;
                  }}
                  className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-xs hover:bg-red-500"
                >
                  ✕
                </button>
                <p className="truncate px-3 py-2 text-xs text-slate-400">{logoFile.name}</p>
              </div>
            )}
            <input
              id="logoInput"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
            />
          </div>
        </section>

        {/* Mode Tabs */}
        <div className="mb-6 flex gap-2">
          {(["logo", "text", "both"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-xl font-medium transition-all ${
                mode === m
                  ? "bg-cyan-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {m === "logo" ? "🏷️ โลโก้" : m === "text" ? "✏️ ข้อความ" : "🎯 ทั้งสอง"}
            </button>
          ))}
        </div>

        {/* Controls + Preview */}
        <div className="grid gap-8 lg:grid-cols-[1fr,1.4fr]">
          {/* Settings Panel */}
          <section className="space-y-5">
            {/* ===== LOGO SETTINGS ===== */}
            {(mode === "logo" || mode === "both") && (
              <div className="rounded-xl bg-slate-800/70 p-4 backdrop-blur border border-slate-600">
                <h3 className="mb-3 text-xl font-semibold text-emerald-400">🏷️ ตั้งค่าโลโก้</h3>
                <div className="space-y-4">
                  {/* Logo Position */}
                  <div>
                    <label className="mb-2 block text-lg text-slate-400">📍 ตำแหน่ง</label>
                    <div className="grid grid-cols-5 gap-2">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => updateLogo("position", p.value)}
                          className={`rounded-lg py-2 text-center text-lg transition-all ${
                            config.logo.position === p.value
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logo Scale */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">ขนาด (Scale)</span>
                      <span className="text-emerald-400">{Math.round(config.logo.scale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={config.logo.scale * 100}
                      onChange={(e) => updateLogo("scale", Number(e.target.value) / 100)}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  {/* Logo Opacity */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">ความเข้ม (Opacity)</span>
                      <span className="text-emerald-400">{Math.round(config.logo.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={config.logo.opacity * 100}
                      onChange={(e) => updateLogo("opacity", Number(e.target.value) / 100)}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  {/* Logo Margin */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">ระยะขอบ (Margin)</span>
                      <span className="text-emerald-400">{config.logo.margin}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={config.logo.margin}
                      onChange={(e) => updateLogo("margin", Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  {/* Logo Rotation */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">มุมหมุน</span>
                      <span className="text-emerald-400">{config.logo.rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={config.logo.rotation}
                      onChange={(e) => updateLogo("rotation", Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  {/* Logo Tile */}
                  <label className="flex cursor-pointer items-center gap-3 text-lg text-slate-300">
                    <input
                      type="checkbox"
                      checked={config.logo.tile}
                      onChange={(e) => updateLogo("tile", e.target.checked)}
                      className="accent-emerald-400"
                    />
                    🔁 โลโก้ซ้อนทับทั้งภาพ
                  </label>
                </div>
              </div>
            )}

            {/* ===== TEXT SETTINGS ===== */}
            {mode !== "logo" && (
              <div className="rounded-xl bg-slate-800/70 p-4 backdrop-blur border border-slate-600">
                <h3 className="mb-3 text-xl font-semibold text-cyan-400">✏️ ตั้งค่าข้อความ</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="พิมพ์ข้อความลายน้ำ..."
                    value={config.text.text}
                    onChange={(e) => updateText("text", e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />

                  {/* Font Family */}
                  <div>
                    <label className="mb-1 block text-lg text-slate-400">🔤 ฟอนต์</label>
                    <select
                      value={config.text.fontFamily}
                      onChange={(e) => updateText("fontFamily", e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                      style={{ fontFamily: config.text.fontFamily }}
                    >
                      {AVAILABLE_FONTS.map((font) => (
                        <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                          {font.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-lg text-slate-400">🎨 สี</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.text.textColor}
                          onChange={(e) => updateText("textColor", e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-600"
                        />
                        <span className="text-xs text-slate-400">{config.text.textColor}</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-lg text-slate-400">📏 ขนาดตัวอักษร</label>
                      <input
                        type="range"
                        min="16"
                        max="120"
                        value={config.text.textSize}
                        onChange={(e) => updateText("textSize", Number(e.target.value))}
                        className="w-full"
                      />
                      <span className="text-xs text-slate-400">{config.text.textSize}px</span>
                    </div>
                  </div>

                  {/* Text Position */}
                  <div>
                    <label className="mb-2 block text-lg text-slate-400">📍 ตำแหน่ง</label>
                    <div className="grid grid-cols-5 gap-2">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => updateText("position", p.value)}
                          className={`rounded-lg py-2 text-center text-lg transition-all ${
                            config.text.position === p.value
                              ? "bg-cyan-500 text-white"
                              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Opacity */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">ความเข้ม (Opacity)</span>
                      <span className="text-cyan-400">{Math.round(config.text.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={config.text.opacity * 100}
                      onChange={(e) => updateText("opacity", Number(e.target.value) / 100)}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Text Margin */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">ระยะขอบ (Margin)</span>
                      <span className="text-cyan-400">{config.text.margin}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={config.text.margin}
                      onChange={(e) => updateText("margin", Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Text Rotation */}
                  <div>
                    <div className="mb-1 flex justify-between text-lg">
                      <span className="text-slate-400">มุมหมุน</span>
                      <span className="text-cyan-400">{config.text.rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={config.text.rotation}
                      onChange={(e) => updateText("rotation", Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Text Tile */}
                  <label className="flex cursor-pointer items-center gap-3 text-lg text-slate-300">
                    <input
                      type="checkbox"
                      checked={config.text.tile}
                      onChange={(e) => updateText("tile", e.target.checked)}
                      className="accent-cyan-400"
                    />
                    🔁 ข้อความซ้อนทับทั้งภาพ
                  </label>
                </div>
              </div>
            )}

            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={!imageFile || isProcessing}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold transition-all ${
                !imageFile || isProcessing
                  ? "cursor-not-allowed bg-slate-700 text-slate-500"
                  : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 hover:shadow-lg hover:shadow-cyan-500/25"
              }`}
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin">⏳</span> กำลังประมวลผล...
                </>
              ) : (
                <>
                  ⬇️ ดาวน์โหลดรูปพร้อมลายน้ำ
                </>
              )}
            </button>
          </section>

          {/* Canvas Preview */}
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-300">🖼️ พรีวิว (แสดงผลแบบ Real-time)</h3>
            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50">
              {imageFile ? (
                <div className="flex justify-center p-4">
                  <canvas
                    ref={canvasRef}
                    className="max-w-full rounded-lg shadow-2xl"
                    style={{ maxHeight: "520px" }}
                  />
                </div>
              ) : (
                <div className="flex h-80 flex-col items-center justify-center gap-3 text-slate-500">
                  <span className="text-5xl">👀</span>
                  <p>อัปโหลดรูปภาพเพื่อดูพรีวิว</p>
                </div>
              )}
            </div>
            {imageFile && (
              <p className="mt-2 text-center text-lg text-slate-500">
                พรีวิวจาก Canvas — คุณภาพจริงอาจแตกต่างเล็กน้อย
              </p>
            )}
          </section>
        </div>
      </main>

      <footer className="mt-12 border-t border-slate-800 px-6 py-4 text-center text-sm text-slate-500">
        สร้างด้วย Next.js + Sharp + Canvas
      </footer>
    </div>
  );
}
