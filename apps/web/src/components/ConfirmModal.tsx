import { useEffect, useId, useRef, useState } from 'react';
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
  const titleId = useId();
  const messageId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => cardRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = [...cardRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea')]
          .filter((node) => !node.hasAttribute('disabled'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}>
      <div className="confirm-modal__overlay" onClick={onCancel} aria-hidden="true" />
      <div className="confirm-modal__card" ref={cardRef}>
        <button type="button" className="confirm-modal__close" onClick={onCancel} aria-label="Fechar">
          <TbX size={20} />
        </button>
        <div className="confirm-modal__header">
          {isDestructive && (
            <div className="confirm-modal__icon">
              <TbAlertTriangle size={24} />
            </div>
          )}
          <h3 id={titleId}>{title}</h3>
        </div>
        <div className="confirm-modal__body">
          <p id={messageId}>{message}</p>
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
