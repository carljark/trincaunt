import React from 'react';

// Iconos de trazo (24x24, heredan el color del texto). Decorativos: el botón que los
// contiene lleva su propio aria-label.
type IconProps = React.SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false
};

export const PencilIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const UserPlusIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

export const ArrowRightIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const FilterIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const SortIcon: React.FC<IconProps & { direction: 'asc' | 'desc' }> = ({ direction, ...props }) => (
  <svg {...baseProps} {...props}>
    {direction === 'desc'
      ? <path d="M12 5v14M6 13l6 6 6-6" />
      : <path d="M12 19V5M6 11l6-6 6 6" />}
  </svg>
);

export const PlusIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Asa de arrastre (dos columnas de puntos)
export const GripIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
  </svg>
);

export const MoreVerticalIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const PaperclipIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  </svg>
);

export const CameraIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export const MicIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
  </svg>
);

export const SendIcon: React.FC<IconProps> = (props) => (
  <svg {...baseProps} {...props}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
  </svg>
);
