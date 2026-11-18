"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  UploadCloud,
  X,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileScan,
  Maximize2,
  SwitchCamera
} from "lucide-react";
import { API_BASE_URL } from "@/config";
import { useLanguage } from "@/context/LanguageContext";

export interface OCRResult {
  name: string;
  designation: string;
  company_name: string;
  mobile: string;
  email: string;
  website: string;
  address: string;
}

interface OCRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (result: OCRResult) => void;
  targetEntity?: "lead" | "client";
}

export default function OCRScannerModal({
  isOpen,
  onClose,
  onExtracted,
  targetEntity = "lead"
}: OCRScannerModalProps) {
  const { language } = useLanguage();
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Stop media tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        language === "es"
          ? "La cámara no es compatible con este navegador. Por favor sube una imagen."
          : "Camera not supported on this browser. Please upload an image."
      );
      setMode("upload");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { });
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      // Fallback: try basic video without facingMode constraint
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play().catch(() => { });
        }
      } catch (fallbackErr: any) {
        setCameraError(
          language === "es"
            ? "Permiso de cámara denegado o no disponible. Puedes subir una foto."
            : "Camera permission denied or unavailable. You can upload a photo."
        );
        setMode("upload");
      }
    }
  }, [facingMode, language, stopCamera]);

  // Manage camera lifecycle
  useEffect(() => {
    if (isOpen && mode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, mode, startCamera, stopCamera]);

  // Handle OCR API request
  const processImageBlob = async (blob: Blob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "scan.jpg");

      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE_URL}/documents/ocr`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(
          language === "es"
            ? "Error del servidor al procesar la imagen."
            : "Server error while processing image."
        );
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const extracted: OCRResult = {
        name: result.name || "",
        designation: result.designation || "",
        company_name: result.company_name || "",
        mobile: result.mobile || "",
        email: result.email || "",
        website: result.website || "",
        address: result.address || "",
      };

      stopCamera();
      onExtracted(extracted);
      onClose();
    } catch (err: any) {
      console.error("OCR extraction failed:", err);
      alert(
        err.message ||
        (language === "es"
          ? "No se pudo extraer información del documento. Intente de nuevo con una foto más clara."
          : "Could not extract information from document. Please try again with a clearer photo.")
      );
      setCapturedPreview(null);
      if (mode === "camera") {
        startCamera();
      }
    } finally {
      setLoading(false);
    }
  };

  // Capture frame from live video
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedPreview(dataUrl);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          processImageBlob(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // Switch between front/back cameras
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Handle uploaded file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    processImageBlob(file);
    e.target.value = "";
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) {
            stopCamera();
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
        >
          {/* Top Gradient Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 shrink-0" />

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <FileScan className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {language === "es"
                    ? targetEntity === "client" ? "Escanear Tarjeta de Cliente" : "Escanear Tarjeta de Lead"
                    : targetEntity === "client" ? "Scan Client Business Card" : "Scan Lead Business Card"}
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  {language === "es"
                    ? "Extracción instantánea con IA Vision"
                    : "Instant extraction powered by Vision AI"}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              disabled={loading}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switch Tabs */}
          <div className="px-5 pt-3 pb-1 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCapturedPreview(null);
                setMode("camera");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === "camera"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{language === "es" ? "Cámara en Vivo" : "Live Camera"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCapturedPreview(null);
                setMode("upload");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === "upload"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{language === "es" ? "Subir Imagen" : "Upload Photo"}</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 flex-1 flex flex-col justify-center">
            {mode === "camera" ? (
              <div className="space-y-3">
                {/* Viewfinder Frame */}
                <div className="relative aspect-[4/3] w-full bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                  {capturedPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capturedPreview}
                      alt="Captured Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Card Viewfinder Target Overlay */}
                  {!capturedPreview && (
                    <div className="absolute inset-4 sm:inset-6 border-2 border-dashed border-white/40 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                      <div className="flex justify-between items-start">
                        <div className="w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                        <div className="w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                      </div>
                      <div className="text-center">
                        <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-[10.5px] font-medium text-white/90">
                          {language === "es"
                            ? "Alinea la tarjeta de presentación"
                            : "Align business card inside frame"}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                        <div className="w-4 h-4 border-b-2 border-r-2 border-blue-400" />
                      </div>
                    </div>
                  )}

                  {/* Processing Overlay */}
                  {loading && (
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2.5 p-4 z-20">
                      <Loader2 className="w-9 h-9 animate-spin text-blue-400" />
                      <p className="text-xs font-bold text-center">
                        {language === "es"
                          ? "Analizando tarjeta con IA..."
                          : "Extracting details with Vision AI..."}
                      </p>
                      <p className="text-[10px] text-zinc-400 text-center max-w-xs">
                        {language === "es"
                          ? "Extrayendo nombre, empresa, email, teléfono y cargo"
                          : "Extracting contact name, company, email, phone, and role"}
                      </p>
                    </div>
                  )}

                  {/* Camera Error */}
                  {cameraError && (
                    <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center p-6 text-center z-10">
                      <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                      <p className="text-xs text-zinc-300 font-medium mb-3">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => setMode("upload")}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs cursor-pointer"
                      >
                        {language === "es" ? "Cambiar a Subir Imagen" : "Switch to Upload Photo"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Camera Controls */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    disabled={loading}
                    title={language === "es" ? "Cambiar cámara (frontal/trasera)" : "Flip camera"}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors shadow-xs cursor-pointer"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={loading || Boolean(cameraError)}
                    className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{language === "es" ? "Procesando..." : "Processing..."}</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span>{language === "es" ? "Capturar y Escanear" : "Snap & Scan Card"}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={loading}
                    title={language === "es" ? "Abrir cámara nativa del teléfono" : "Open device native camera"}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors shadow-xs cursor-pointer text-xs font-semibold"
                  >
                    <span className="hidden sm:inline text-[11px]">{language === "es" ? "Nativa" : "Native"}</span>
                    <Maximize2 className="w-4 h-4 sm:hidden" />
                  </button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Upload Drag & Drop Area */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-zinc-800/30 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={loading}
                    className="hidden"
                  />

                  {loading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" />
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        {language === "es" ? "Extrayendo datos de la tarjeta..." : "Extracting card data..."}
                      </p>
                    </div>
                  ) : capturedPreview ? (
                    <div className="flex flex-col items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capturedPreview}
                        alt="Preview"
                        className="max-h-36 rounded-xl object-contain border border-slate-200 dark:border-zinc-700 mb-2"
                      />
                      <span className="text-xs text-blue-600 font-bold">
                        {language === "es" ? "Haga clic para cambiar imagen" : "Click to choose another photo"}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        {language === "es"
                          ? "Haz clic o arrastra una foto de la tarjeta aquí"
                          : "Click or drag & drop a business card photo here"}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                        JPG, PNG, WEBP (hasta 10MB)
                      </p>
                    </>
                  )}
                </div>

                {/* Mobile Camera Direct Button */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>
                      {language === "es"
                        ? "Tomar foto con la cámara del móvil"
                        : "Take photo with mobile camera"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

