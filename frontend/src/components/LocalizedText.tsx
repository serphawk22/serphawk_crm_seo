"use client";

import { useTranslation } from "react-i18next";
import "@/i18n/config";
import { translate } from "@/lib/translate";

/** Translate only explicitly marked product copy; record names and user content stay untouched. */
export default function LocalizedText({ text }: { text: string }) {
  // Some confirmations mount in a separate React root, outside LanguageProvider.
  const { i18n } = useTranslation();
  return <>{translate(text, i18n.language || "en")}</>;
}
