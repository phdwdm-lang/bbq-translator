"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  error?: string;
  loading?: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  error,
  loading = false,
  confirmLabel = "确认",
  loadingLabel = "处理中…",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-3 text-sm text-slate-600">{message}</p>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            disabled={loading}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
