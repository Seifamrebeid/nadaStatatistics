export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
         onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex justify-between items-center">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t bg-slate-50 rounded-b-lg flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}
