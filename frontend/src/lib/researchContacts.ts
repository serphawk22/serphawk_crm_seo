/** Normalize research contacts without accepting headings, placeholders or image filenames. */
const EMAIL = /[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,63}/gi;
const EXCLUDED = new Set(['test@example.com', 'support.crm@serphawk.in']);
const ASSETS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'css', 'js', 'woff', 'woff2']);

export function isEmailAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const address = value.trim();
  const match = address.match(EMAIL);
  return !!match && match.length === 1 && match[0] === address
    && !ASSETS.has(address.split('.').at(-1)!.toLowerCase());
}

export function emailAddresses(...values: unknown[]): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit((value as { email?: unknown }).email);
    else if (typeof value === 'string') {
      for (const address of value.match(EMAIL) || []) {
        if (isEmailAddress(address) && !EXCLUDED.has(address.toLowerCase()) && !seen.has(address.toLowerCase())) {
          seen.add(address.toLowerCase());
          emails.push(address);
        }
      }
    }
  };
  values.forEach(visit);
  return emails;
}

export function researchEmails(result: unknown): string[] {
  const data = (result || {}) as { contact?: unknown; contacts?: unknown; company_info?: { contacts?: unknown; email?: unknown; extracted_emails?: unknown } };
  return emailAddresses(data.contact, data.company_info?.contacts, data.contacts, data.company_info?.email, data.company_info?.extracted_emails);
}

export const researchRecipient = (result: unknown): string => researchEmails(result)[0] || '';
