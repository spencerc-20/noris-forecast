// components/shared/ContactLinks.tsx — Clickable tel: and mailto: links for customer contact info.

import { Phone, Mail } from "lucide-react";

interface ContactLinksProps {
  phone?: string;
  email?: string;
  className?: string;
}

export function ContactLinks({ phone, email, className }: ContactLinksProps) {
  if (!phone && !email) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${className ?? ""}`}>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          <Phone size={13} />
          {phone}
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          <Mail size={13} />
          {email}
        </a>
      )}
    </div>
  );
}
