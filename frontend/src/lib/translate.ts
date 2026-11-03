import en from "@/translations/en.json";
import es from "@/translations/es.json";
import enCommon from "@/locales/en/common.json";
import esCommon from "@/locales/es/common.json";
import phrases from "@/translations/phrases.es.json";
import interfaceSpanish from "@/translations/interface.es.json";

type Dictionary = { [key: string]: string | Dictionary };
export type TranslationValues = Record<string, string | number>;
function lookup(dictionary: Dictionary, key: string): string | undefined {
  if (typeof dictionary[key] === "string") return dictionary[key];
  let value: string | Dictionary | undefined = dictionary;
  for (const part of key.split(".")) value = typeof value === "object" ? value[part] : undefined;
  return typeof value === "string" ? value : undefined;
}

const spanishPhrases: Record<string, string> = Object.create(null);
function collect(english: Dictionary, spanish: Dictionary) {
  for (const [key, value] of Object.entries(english)) {
    const translated = spanish[key];
    if (typeof value === "string" && typeof translated === "string" && value !== translated) spanishPhrases[value] ??= translated;
    else if (typeof value === "object" && typeof translated === "object") collect(value, translated);
  }
}
collect(en, es);
collect(enCommon, esCommon);
Object.assign(spanishPhrases, phrases);
Object.assign(spanishPhrases, interfaceSpanish);

/** Both translation APIs use the same language and English fallback. Never translate customer data. */
export function translate(key: string, language: string, values?: TranslationValues): string {
  const english = lookup(en, key) ?? lookup(enCommon, key) ?? key;
  const message = language.startsWith("es")
    ? lookup(es, key) ?? lookup(esCommon, key) ?? spanishPhrases[english] ?? english
    : english;
  return values ? message.replace(/\{\{(\w+)\}\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder) : message;
}
