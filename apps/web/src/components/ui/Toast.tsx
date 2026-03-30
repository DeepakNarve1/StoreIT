import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useToast } from "./toastStore";

const icons = { success: CheckCircle, error: AlertCircle, info: Info };
const colors = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

export function ToastContainer() {
  const { toasts, remove } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-3 rounded-lg border shadow-md text-sm ${colors[t.type]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
