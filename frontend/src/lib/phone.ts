/**
 * Phone numbers are stored as one string: "<dial code> <national number>", e.g. "+91 98765 43210".
 * The country list and the parser are shared by every phone field (see components/PhoneInput.tsx).
 */

export interface CountryDialCode {
  name: string;
  nativeName?: string;
  code: string;
  dialCode: string;
  flag: string;
}

/** The countries people use most, shown first. */
const PRIORITY_COUNTRIES: CountryDialCode[] = [
  { name: "Spain", nativeName: "España", code: "ES", dialCode: "+34", flag: "🇪🇸" },
  { name: "India", nativeName: "Bharat", code: "IN", dialCode: "+91", flag: "🇮🇳" },
  { name: "United States", nativeName: "USA", code: "US", dialCode: "+1", flag: "🇺🇸" },
  { name: "United Kingdom", nativeName: "UK", code: "GB", dialCode: "+44", flag: "🇬🇧" },
  { name: "Canada", nativeName: "Canada", code: "CA", dialCode: "+1", flag: "🇨🇦" },
  { name: "Mexico", nativeName: "México", code: "MX", dialCode: "+52", flag: "🇲🇽" },
  { name: "Australia", nativeName: "Australia", code: "AU", dialCode: "+61", flag: "🇦🇺" },
  { name: "Germany", nativeName: "Deutschland", code: "DE", dialCode: "+49", flag: "🇩🇪" },
  { name: "France", nativeName: "France", code: "FR", dialCode: "+33", flag: "🇫🇷" },
  { name: "Italy", nativeName: "Italia", code: "IT", dialCode: "+39", flag: "🇮🇹" },
  { name: "Portugal", nativeName: "Portugal", code: "PT", dialCode: "+351", flag: "🇵🇹" },
  { name: "United Arab Emirates", nativeName: "UAE", code: "AE", dialCode: "+971", flag: "🇦🇪" },
  { name: "Saudi Arabia", nativeName: "KSA", code: "SA", dialCode: "+966", flag: "🇸🇦" },
  { name: "Singapore", nativeName: "Singapore", code: "SG", dialCode: "+65", flag: "🇸🇬" },
  { name: "Japan", nativeName: "Nihon", code: "JP", dialCode: "+81", flag: "🇯🇵" },
  { name: "China", nativeName: "China", code: "CN", dialCode: "+86", flag: "🇨🇳" },
  { name: "Brazil", nativeName: "Brasil", code: "BR", dialCode: "+55", flag: "🇧🇷" },
  { name: "Argentina", nativeName: "Argentina", code: "AR", dialCode: "+54", flag: "🇦🇷" },
  { name: "Colombia", nativeName: "Colombia", code: "CO", dialCode: "+57", flag: "🇨🇴" },
  { name: "Chile", nativeName: "Chile", code: "CL", dialCode: "+56", flag: "🇨🇱" },
  { name: "Peru", nativeName: "Perú", code: "PE", dialCode: "+51", flag: "🇵🇪" },
  { name: "Ecuador", nativeName: "Ecuador", code: "EC", dialCode: "+593", flag: "🇪🇨" },
  { name: "Netherlands", nativeName: "Nederland", code: "NL", dialCode: "+31", flag: "🇳🇱" },
  { name: "Switzerland", nativeName: "Schweiz", code: "CH", dialCode: "+41", flag: "🇨🇭" },
  { name: "Sweden", nativeName: "Sverige", code: "SE", dialCode: "+46", flag: "🇸🇪" },
  { name: "Norway", nativeName: "Norge", code: "NO", dialCode: "+47", flag: "🇳🇴" },
  { name: "Denmark", nativeName: "Danmark", code: "DK", dialCode: "+45", flag: "🇩🇰" },
  { name: "Finland", nativeName: "Suomi", code: "FI", dialCode: "+358", flag: "🇫🇮" },
  { name: "Ireland", nativeName: "Éire", code: "IE", dialCode: "+353", flag: "🇮🇪" },
  { name: "Belgium", nativeName: "België", code: "BE", dialCode: "+32", flag: "🇧🇪" },
  { name: "Austria", nativeName: "Österreich", code: "AT", dialCode: "+43", flag: "🇦🇹" },
  { name: "Poland", nativeName: "Polska", code: "PL", dialCode: "+48", flag: "🇵🇱" },
  { name: "Greece", nativeName: "Hellas", code: "GR", dialCode: "+30", flag: "🇬🇷" },
  { name: "Turkey", nativeName: "Türkiye", code: "TR", dialCode: "+90", flag: "🇹🇷" },
  { name: "South Africa", nativeName: "South Africa", code: "ZA", dialCode: "+27", flag: "🇿🇦" },
  { name: "Egypt", nativeName: "Misr", code: "EG", dialCode: "+20", flag: "🇪🇬" },
  { name: "Nigeria", nativeName: "Nigeria", code: "NG", dialCode: "+234", flag: "🇳🇬" },
  { name: "Kenya", nativeName: "Kenya", code: "KE", dialCode: "+254", flag: "🇰🇪" },
  { name: "Morocco", nativeName: "Maroc", code: "MA", dialCode: "+212", flag: "🇲🇦" },
  { name: "New Zealand", nativeName: "Aotearoa", code: "NZ", dialCode: "+64", flag: "🇳🇿" },
  { name: "South Korea", nativeName: "Hanguk", code: "KR", dialCode: "+82", flag: "🇰🇷" },
  { name: "Philippines", nativeName: "Pilipinas", code: "PH", dialCode: "+63", flag: "🇵🇭" },
  { name: "Malaysia", nativeName: "Malaysia", code: "MY", dialCode: "+60", flag: "🇲🇾" },
  { name: "Indonesia", nativeName: "Indonesia", code: "ID", dialCode: "+62", flag: "🇮🇩" },
  { name: "Thailand", nativeName: "Mueang Thai", code: "TH", dialCode: "+66", flag: "🇹🇭" },
  { name: "Vietnam", nativeName: "Việt Nam", code: "VN", dialCode: "+84", flag: "🇻🇳" },
  { name: "Pakistan", nativeName: "Pakistan", code: "PK", dialCode: "+92", flag: "🇵🇰" },
  { name: "Bangladesh", nativeName: "Bangladesh", code: "BD", dialCode: "+880", flag: "🇧🇩" },
  { name: "Sri Lanka", nativeName: "Sri Lanka", code: "LK", dialCode: "+94", flag: "🇱🇰" },
  { name: "Nepal", nativeName: "Nepal", code: "NP", dialCode: "+977", flag: "🇳🇵" },
  { name: "Qatar", nativeName: "Qatar", code: "QA", dialCode: "+974", flag: "🇶🇦" },
  { name: "Kuwait", nativeName: "Kuwait", code: "KW", dialCode: "+965", flag: "🇰🇼" },
  { name: "Oman", nativeName: "Oman", code: "OM", dialCode: "+968", flag: "🇴🇲" },
  { name: "Bahrain", nativeName: "Bahrain", code: "BH", dialCode: "+973", flag: "🇧🇭" },
  { name: "Israel", nativeName: "Yisra'el", code: "IL", dialCode: "+972", flag: "🇮🇱" },
  { name: "Jordan", nativeName: "Al-Urdun", code: "JO", dialCode: "+962", flag: "🇯🇴" },
  { name: "Lebanon", nativeName: "Lubnan", code: "LB", dialCode: "+961", flag: "🇱🇧" },
  { name: "Hong Kong", nativeName: "Hong Kong", code: "HK", dialCode: "+852", flag: "🇭🇰" },
  { name: "Taiwan", nativeName: "Taiwan", code: "TW", dialCode: "+886", flag: "🇹🇼" },
  { name: "Czech Republic", nativeName: "Česko", code: "CZ", dialCode: "+420", flag: "🇨🇿" },
  { name: "Romania", nativeName: "România", code: "RO", dialCode: "+40", flag: "🇷🇴" },
  { name: "Hungary", nativeName: "Magyarország", code: "HU", dialCode: "+36", flag: "🇭🇺" },
  { name: "Uruguay", nativeName: "Uruguay", code: "UY", dialCode: "+598", flag: "🇺🇾" },
  { name: "Costa Rica", nativeName: "Costa Rica", code: "CR", dialCode: "+506", flag: "🇨🇷" },
  { name: "Panama", nativeName: "Panamá", code: "PA", dialCode: "+507", flag: "🇵🇦" },
  { name: "Dominican Republic", nativeName: "República Dominicana", code: "DO", dialCode: "+1", flag: "🇩🇴" },
  { name: "Puerto Rico", nativeName: "Puerto Rico", code: "PR", dialCode: "+1", flag: "🇵🇷" },
  { name: "Croatia", nativeName: "Hrvatska", code: "HR", dialCode: "+385", flag: "🇭🇷" },
  { name: "Bulgaria", nativeName: "Bulgaria", code: "BG", dialCode: "+359", flag: "🇧🇬" },
  { name: "Ukraine", nativeName: "Ukraina", code: "UA", dialCode: "+380", flag: "🇺🇦" },
  { name: "Russia", nativeName: "Rossiya", code: "RU", dialCode: "+7", flag: "🇷🇺" },
];

// [ISO code, name, dial code]. +1 is shared by the United States, Canada and the Caribbean / Pacific territories.
const OTHER_COUNTRIES: [string, string, string][] = [
  ["AF", "Afghanistan", "+93"], ["AL", "Albania", "+355"], ["DZ", "Algeria", "+213"], ["AS", "American Samoa", "+1"],
  ["AD", "Andorra", "+376"], ["AO", "Angola", "+244"], ["AI", "Anguilla", "+1"], ["AG", "Antigua and Barbuda", "+1"],
  ["AM", "Armenia", "+374"], ["AW", "Aruba", "+297"], ["AZ", "Azerbaijan", "+994"], ["BS", "Bahamas", "+1"],
  ["BB", "Barbados", "+1"], ["BY", "Belarus", "+375"], ["BZ", "Belize", "+501"], ["BJ", "Benin", "+229"],
  ["BM", "Bermuda", "+1"], ["BT", "Bhutan", "+975"], ["BO", "Bolivia", "+591"], ["BA", "Bosnia and Herzegovina", "+387"],
  ["BW", "Botswana", "+267"], ["VG", "British Virgin Islands", "+1"], ["BN", "Brunei", "+673"], ["BF", "Burkina Faso", "+226"],
  ["BI", "Burundi", "+257"], ["KH", "Cambodia", "+855"], ["CM", "Cameroon", "+237"], ["CV", "Cape Verde", "+238"],
  ["KY", "Cayman Islands", "+1"], ["CF", "Central African Republic", "+236"], ["TD", "Chad", "+235"], ["KM", "Comoros", "+269"],
  ["CG", "Congo", "+242"], ["CD", "DR Congo", "+243"], ["CU", "Cuba", "+53"], ["CW", "Curaçao", "+599"],
  ["CY", "Cyprus", "+357"], ["CI", "Côte d'Ivoire", "+225"], ["DJ", "Djibouti", "+253"], ["DM", "Dominica", "+1"],
  ["SV", "El Salvador", "+503"], ["GQ", "Equatorial Guinea", "+240"], ["ER", "Eritrea", "+291"], ["EE", "Estonia", "+372"],
  ["SZ", "Eswatini", "+268"], ["ET", "Ethiopia", "+251"], ["FO", "Faroe Islands", "+298"], ["FJ", "Fiji", "+679"],
  ["PF", "French Polynesia", "+689"], ["GA", "Gabon", "+241"], ["GM", "Gambia", "+220"], ["GE", "Georgia", "+995"],
  ["GH", "Ghana", "+233"], ["GI", "Gibraltar", "+350"], ["GL", "Greenland", "+299"], ["GD", "Grenada", "+1"],
  ["GP", "Guadeloupe", "+590"], ["GU", "Guam", "+1"], ["GT", "Guatemala", "+502"], ["GG", "Guernsey", "+44"],
  ["GN", "Guinea", "+224"], ["GW", "Guinea-Bissau", "+245"], ["GY", "Guyana", "+592"], ["HT", "Haiti", "+509"],
  ["HN", "Honduras", "+504"], ["IS", "Iceland", "+354"], ["IR", "Iran", "+98"], ["IQ", "Iraq", "+964"],
  ["IM", "Isle of Man", "+44"], ["JM", "Jamaica", "+1"], ["JE", "Jersey", "+44"], ["KZ", "Kazakhstan", "+7"],
  ["KI", "Kiribati", "+686"], ["XK", "Kosovo", "+383"], ["KG", "Kyrgyzstan", "+996"], ["LA", "Laos", "+856"],
  ["LV", "Latvia", "+371"], ["LS", "Lesotho", "+266"], ["LR", "Liberia", "+231"], ["LY", "Libya", "+218"],
  ["LI", "Liechtenstein", "+423"], ["LT", "Lithuania", "+370"], ["LU", "Luxembourg", "+352"], ["MO", "Macao", "+853"],
  ["MG", "Madagascar", "+261"], ["MW", "Malawi", "+265"], ["MV", "Maldives", "+960"], ["ML", "Mali", "+223"],
  ["MT", "Malta", "+356"], ["MH", "Marshall Islands", "+692"], ["MQ", "Martinique", "+596"], ["MR", "Mauritania", "+222"],
  ["MU", "Mauritius", "+230"], ["FM", "Micronesia", "+691"], ["MD", "Moldova", "+373"], ["MC", "Monaco", "+377"],
  ["MN", "Mongolia", "+976"], ["ME", "Montenegro", "+382"], ["MS", "Montserrat", "+1"], ["MZ", "Mozambique", "+258"],
  ["MM", "Myanmar", "+95"], ["NA", "Namibia", "+264"], ["NR", "Nauru", "+674"], ["NC", "New Caledonia", "+687"],
  ["NI", "Nicaragua", "+505"], ["NE", "Niger", "+227"], ["KP", "North Korea", "+850"], ["MK", "North Macedonia", "+389"],
  ["MP", "Northern Mariana Islands", "+1"], ["PS", "Palestine", "+970"], ["PG", "Papua New Guinea", "+675"],
  ["PY", "Paraguay", "+595"], ["RE", "Réunion", "+262"], ["RW", "Rwanda", "+250"], ["WS", "Samoa", "+685"],
  ["SM", "San Marino", "+378"], ["ST", "São Tomé and Príncipe", "+239"], ["SN", "Senegal", "+221"], ["RS", "Serbia", "+381"],
  ["SC", "Seychelles", "+248"], ["SL", "Sierra Leone", "+232"], ["SK", "Slovakia", "+421"], ["SI", "Slovenia", "+386"],
  ["SB", "Solomon Islands", "+677"], ["SO", "Somalia", "+252"], ["SS", "South Sudan", "+211"], ["KN", "St Kitts and Nevis", "+1"],
  ["LC", "St Lucia", "+1"], ["VC", "St Vincent and the Grenadines", "+1"], ["SD", "Sudan", "+249"], ["SR", "Suriname", "+597"],
  ["SY", "Syria", "+963"], ["TJ", "Tajikistan", "+992"], ["TZ", "Tanzania", "+255"], ["TL", "Timor-Leste", "+670"],
  ["TG", "Togo", "+228"], ["TO", "Tonga", "+676"], ["TT", "Trinidad and Tobago", "+1"], ["TN", "Tunisia", "+216"],
  ["TM", "Turkmenistan", "+993"], ["TC", "Turks and Caicos Islands", "+1"], ["TV", "Tuvalu", "+688"], ["UG", "Uganda", "+256"],
  ["VI", "U.S. Virgin Islands", "+1"], ["UZ", "Uzbekistan", "+998"], ["VU", "Vanuatu", "+678"], ["VA", "Vatican City", "+39"],
  ["VE", "Venezuela", "+58"], ["YE", "Yemen", "+967"], ["ZM", "Zambia", "+260"], ["ZW", "Zimbabwe", "+263"],
];

/** The flag emoji for an ISO 3166 code, built from regional-indicator letters. */
export function flagFromIso(code: string): string {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

/** Every country, the common ones first, the rest alphabetical. */
export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  ...PRIORITY_COUNTRIES,
  ...OTHER_COUNTRIES
    .filter(([code]) => !PRIORITY_COUNTRIES.some((c) => c.code === code))
    .map(([code, name, dialCode]): CountryDialCode => ({ name, code, dialCode, flag: flagFromIso(code) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
];

export function parsePhoneNumber(fullNumber: string, defaultCode = "+1"): { dialCode: string; nationalNumber: string } {
  if (!fullNumber || !fullNumber.trim()) {
    return { dialCode: defaultCode, nationalNumber: "" };
  }
  const clean = fullNumber.trim();
  if (clean.startsWith("+")) {
    // longest dial code first, so +971 is not read as +97...
    const sorted = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (clean.startsWith(c.dialCode)) {
        return { dialCode: c.dialCode, nationalNumber: clean.slice(c.dialCode.length).trim() };
      }
    }
    return { dialCode: defaultCode, nationalNumber: clean.replace(/^\+/, "") };
  }
  // No "+": this is a national number of the default country. Do NOT guess a country from the first digits
  // (98765 43210 is an Indian number, not Iran +98). Only drop the default country's own prefix when the
  // number is clearly long enough to include it (919876543210 with +91).
  const digits = defaultCode.replace("+", "");
  const compact = clean.replace(/[\s\-()]/g, "");
  if (compact.startsWith(digits) && compact.length >= digits.length + 8) {
    return { dialCode: defaultCode, nationalNumber: compact.slice(digits.length) };
  }
  return { dialCode: defaultCode, nationalNumber: clean };
}

/** A plausible phone number (or empty). Loose on purpose: formats differ a lot between countries. */
export function isPlausiblePhone(full: string): boolean {
  const v = (full || "").trim();
  return v === "" || /^\+?[0-9\s\-()]{7,20}$/.test(v);
}

/** Join a dial code and a national number into the stored form; empty when there is no national number. */
export function joinPhone(dialCode: string, national: string): string {
  const n = (national || "").trim();
  return n ? `${dialCode} ${n}` : "";
}

/** The dial code for the browser's region (en-IN -> +91), or null when it cannot be told. */
export function dialCodeFromLocale(): string | null {
  try {
    const lang = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "";
    const region = lang.split("-")[1]?.toUpperCase();
    return COUNTRY_DIAL_CODES.find((c) => c.code === region)?.dialCode ?? null;
  } catch {
    return null;
  }
}
