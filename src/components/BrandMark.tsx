import React from 'react';

export const FIRM_LOGO_PATH = '/assets/aistudio/image_f3308bb9.png';

interface BrandMarkProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'navy' | 'gold' | 'outline';
  className?: string;
}

/**
 * Logo oficial Fernandes & Lins Assessoria Jurídica.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 'md',
  variant = 'navy',
  className = '',
}) => {
  const dimensions = {
    xs: 'w-7 h-7',
    sm: 'w-9 h-9',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16 sm:w-20 sm:h-20',
  }[size];

  const ringStyles = {
    navy: 'border-[#1E3A8A] bg-[#161616]',
    gold: 'border-[#FACC15]/80 bg-[#161616]',
    outline: 'border-[#BFDBFE] bg-[#161616]',
  }[variant];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden rounded-full border-2 ${dimensions} ${ringStyles} ${className}`}
    >
      <img
        src={FIRM_LOGO_PATH}
        alt="Logo Fernandes & Lins Assessoria Jurídica"
        className="w-full h-full object-cover scale-[1.08]"
      />
    </div>
  );
};

interface ServiceCategoryGlyphProps {
  category: string;
  className?: string;
}

/**
 * Ícones vetoriais institucionais para áreas jurídicas.
 */
export const ServiceCategoryGlyph: React.FC<ServiceCategoryGlyphProps> = ({
  category,
  className = 'w-5 h-5',
}) => {
  const cat = category.toLowerCase();

  // Trabalhista / Empresarial (Pasta / Maleta jurídica)
  if (cat.includes('trabalh') || cat.includes('empres')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 13h18" />
      </svg>
    );
  }

  // Família & Sucessões (Escudo / Proteção)
  if (cat.includes('famíl') || cat.includes('famil') || cat.includes('sucess')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
        <path d="M9.5 12.2l1.8 1.8 3.5-3.8" />
      </svg>
    );
  }

  // Previdenciário / Cível (Documento / Contrato)
  if (cat.includes('previd') || cat.includes('contrat')) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }

  // Balança da Justiça padrão
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M8 21h8" />
      <path d="M5 7l-2.5 6h5L5 7Z" />
      <path d="M19 7l-2.5 6h5L19 7Z" />
    </svg>
  );
};
