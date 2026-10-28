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
