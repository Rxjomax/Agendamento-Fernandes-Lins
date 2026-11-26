import React from 'react';
import { Check, AlertCircle, X } from 'lucide-react';
import { ToastMessage } from '../types/scheduling';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2.5rem)] sm:w-full pointer-events-none"
      role="region"
      aria-label="Notificações do sistema"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start justify-between gap-3 bg-[#0B2545] text-white border border-[#1E3A8A] rounded-xl px-4 py-3 shadow-lg transition-all duration-150"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {toast.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-tight text-white leading-snug">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  {toast.description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-slate-300 hover:text-white transition-colors p-1 shrink-0 cursor-pointer"
            aria-label="Fechar notificação"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
