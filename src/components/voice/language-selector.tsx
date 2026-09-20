'use client';

import { Globe } from 'lucide-react';
import type { LanguageCode, LanguageOption } from '@/types';
import { SUPPORTED_LANGUAGES } from '@/types';

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  disabled?: boolean;
}

export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
        <Globe size={12} />
        Language
      </label>
      <div className="flex gap-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onChange(lang.code)}
            disabled={disabled}
            className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-xs font-medium transition-all border ${
              value === lang.code
                ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label={`Select ${lang.name}`}
            id={`lang-${lang.code}`}
          >
            <span className="text-base">{lang.flag}</span>
            <span>{lang.nativeName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
