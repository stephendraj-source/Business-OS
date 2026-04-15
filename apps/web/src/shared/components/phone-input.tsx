import { useState } from "react";
import { cn } from "@/shared/lib/utils";

export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "SG", name: "Singapore",            dial: "+65",  flag: "🇸🇬" },
  { code: "AU", name: "Australia",            dial: "+61",  flag: "🇦🇺" },
  { code: "BD", name: "Bangladesh",           dial: "+880", flag: "🇧🇩" },
  { code: "BR", name: "Brazil",               dial: "+55",  flag: "🇧🇷" },
  { code: "CA", name: "Canada",               dial: "+1",   flag: "🇨🇦" },
  { code: "CN", name: "China",                dial: "+86",  flag: "🇨🇳" },
  { code: "DE", name: "Germany",              dial: "+49",  flag: "🇩🇪" },
  { code: "EG", name: "Egypt",                dial: "+20",  flag: "🇪🇬" },
  { code: "FR", name: "France",               dial: "+33",  flag: "🇫🇷" },
  { code: "GB", name: "United Kingdom",       dial: "+44",  flag: "🇬🇧" },
  { code: "HK", name: "Hong Kong",            dial: "+852", flag: "🇭🇰" },
  { code: "ID", name: "Indonesia",            dial: "+62",  flag: "🇮🇩" },
  { code: "IN", name: "India",                dial: "+91",  flag: "🇮🇳" },
  { code: "JP", name: "Japan",                dial: "+81",  flag: "🇯🇵" },
  { code: "KR", name: "South Korea",          dial: "+82",  flag: "🇰🇷" },
  { code: "LK", name: "Sri Lanka",            dial: "+94",  flag: "🇱🇰" },
  { code: "MM", name: "Myanmar",              dial: "+95",  flag: "🇲🇲" },
  { code: "MX", name: "Mexico",               dial: "+52",  flag: "🇲🇽" },
  { code: "MY", name: "Malaysia",             dial: "+60",  flag: "🇲🇾" },
  { code: "NG", name: "Nigeria",              dial: "+234", flag: "🇳🇬" },
  { code: "NL", name: "Netherlands",          dial: "+31",  flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand",          dial: "+64",  flag: "🇳🇿" },
  { code: "PH", name: "Philippines",          dial: "+63",  flag: "🇵🇭" },
  { code: "PK", name: "Pakistan",             dial: "+92",  flag: "🇵🇰" },
  { code: "SA", name: "Saudi Arabia",         dial: "+966", flag: "🇸🇦" },
  { code: "TH", name: "Thailand",             dial: "+66",  flag: "🇹🇭" },
  { code: "TW", name: "Taiwan",               dial: "+886", flag: "🇹🇼" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { code: "US", name: "United States",        dial: "+1",   flag: "🇺🇸" },
  { code: "VN", name: "Vietnam",              dial: "+84",  flag: "🇻🇳" },
  { code: "ZA", name: "South Africa",         dial: "+27",  flag: "🇿🇦" },
];

const DEFAULT_COUNTRY = COUNTRIES[0];

function parseValue(raw: string): { country: Country; number: string } {
  if (!raw) return { country: DEFAULT_COUNTRY, number: "" };
  for (const c of COUNTRIES) {
    if (raw.startsWith(c.dial + " ")) {
      return { country: c, number: raw.slice(c.dial.length + 1) };
    }
    if (raw.startsWith(c.dial)) {
      return { country: c, number: raw.slice(c.dial.length) };
    }
  }
  return { country: DEFAULT_COUNTRY, number: raw };
}

interface PhoneInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  error?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  selectClassName,
  inputClassName,
  error,
}: PhoneInputProps) {
  const parsed = parseValue(value);
  const [country, setCountry] = useState<Country>(parsed.country);
  const [number, setNumber] = useState(parsed.number);

  const emit = (c: Country, n: string) => {
    onChange(n ? `${c.dial} ${n}` : "");
  };

  const handleCountryChange = (code: string) => {
    const c = COUNTRIES.find(x => x.code === code) ?? DEFAULT_COUNTRY;
    setCountry(c);
    emit(c, number);
  };

  const handleNumberChange = (n: string) => {
    const digits = n.replace(/[^\d\s\-().+]/g, "");
    setNumber(digits);
    emit(country, digits);
  };

  return (
    <div className={cn("flex rounded-lg overflow-hidden border", error ? "border-red-400" : "border-border hover:border-primary/40", className)}>
      <select
        value={country.code}
        onChange={e => handleCountryChange(e.target.value)}
        className={cn(
          "flex-shrink-0 bg-secondary/40 border-r border-border text-sm px-2 py-2 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary/50 cursor-pointer",
          selectClassName
        )}
        title="Country code"
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={number}
        onChange={e => handleNumberChange(e.target.value)}
        placeholder={placeholder || "Phone number"}
        className={cn(
          "flex-1 min-w-0 bg-background text-sm px-3 py-2 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary/50",
          inputClassName
        )}
      />
    </div>
  );
}
