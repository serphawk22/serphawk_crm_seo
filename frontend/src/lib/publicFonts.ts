import { Playfair_Display, Lora } from "next/font/google";

// Display serif for headlines on public pages (Journal & Store)
export const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// Reading serif for long-form article body copy
export const bodySerif = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

