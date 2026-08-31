import { useEffect, useState } from 'react';
import { TbAlertTriangle, TbX } from 'react-icons/tb';

export type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Excluir',
  cancelText = 'Cancelar',
  isDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="confirm-modal__overlay" onClick={onCancel} aria-hidden="true" />
      <div className="confirm-modal__card">
        <button type="button" className="confirm-modal__close" onClick={onCancel} aria-label="Fechar">
          <TbX size={20} />
        </button>
        <div className="confirm-modal__header">
          {isDestructive && (
            <div className="confirm-modal__icon">
              <TbAlertTriangle size={24} />
            </div>
          )}
          <h3 id="confirm-modal-title">{title}</h3>
        </div>
        <div className="confirm-modal__body">
          <p>{message}</p>
        </div>
        <div className="confirm-modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            type="button" 
            className={`btn ${isDestructive ? 'btn--danger' : 'btn--primary'}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const confirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }) => {
    setConfig(options);
    setIsOpen(true);
  };

  const ConfirmElement = (
    <ConfirmModal
      isOpen={isOpen}
      title={config.title}
      message={config.message}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      isDestructive={config.isDestructive}
      onConfirm={() => {
        config.onConfirm();
        setIsOpen(false);
      }}
      onCancel={() => setIsOpen(false)}
    />
  );

  return { confirm, ConfirmElement };
}

