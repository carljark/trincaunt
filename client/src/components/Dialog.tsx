import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';
import './Dialog.scss';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // Botones fijos al pie (fuera de la zona con scroll)
  footer?: React.ReactNode;
  // Envuelve cuerpo y pie en un <form> para que el botón submit del pie funcione
  onSubmit?: (e: React.FormEvent) => void;
  // Mientras se guarda, ni Escape ni el fondo cierran el diálogo
  busy?: boolean;
}

// Diálogo modal común: hoja inferior en móvil, ventana centrada en escritorio.
const Dialog: React.FC<DialogProps> = ({ title, onClose, children, footer, onSubmit, busy = false }) => {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Evita que la página de detrás haga scroll con el diálogo abierto
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, busy]);

  const content = (
    <>
      <div className="dialog__body">{children}</div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </>
  );

  // En un portal: así ningún contenedor con transform o overflow (p. ej. el FAB) lo recorta
  return createPortal(
    <div
      className="dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog__header">
          <h2 className="dialog__title" id={titleId}>{title}</h2>
          <button type="button" className="dialog__close" onClick={onClose} disabled={busy} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>
        {onSubmit ? <form className="dialog__form" onSubmit={onSubmit}>{content}</form> : content}
      </div>
    </div>,
    document.body
  );
};

export default Dialog;
