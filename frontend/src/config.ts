export const API_BASE_URL = '/api/backend';

// WhatsApp destination (digits only, no "+"). Configure via NEXT_PUBLIC_WHATSAPP_NUMBER.
export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919502901416").replace(/\D/g, "");
export const WHATSAPP_DISPLAY = (process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY || "+91 9502901416");
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
