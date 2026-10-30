import React from 'react';
import Dialog from './Dialog';
import './ConfirmationModal.scss';

interface ConfirmationModalProps {
  message: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ message, title = '¿Confirmar?', confirmLabel = 'Confirmar', onConfirm, onCancel }) => {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="confirmation__button confirmation__button--secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="confirmation__button confirmation__button--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirmation__message">{message}</p>
    </Dialog>
  );
};

export default ConfirmationModal;
