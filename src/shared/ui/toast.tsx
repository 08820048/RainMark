/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type ToastType = "success" | "info" | "warning" | "error";
type ToastItem = { id: string; type: ToastType; title?: string; message: string; duration?: number };

let container: HTMLDivElement | null = null;
let root: any = null;
const listeners: Array<(items: ToastItem[]) => void> = [];
let items: ToastItem[] = [];

function emit() {
  for (const l of listeners) l(items);
}

function mount() {
  if (container) return;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(<ToastHost />);
}

function remove(id: string) {
  items = items.filter((i) => i.id !== id);
  emit();
}

function push(t: ToastItem) {
  items = [...items, t];
  emit();
  const ms = typeof t.duration === "number" ? t.duration : 2800;
  if (ms > 0) setTimeout(() => remove(t.id), ms);
}

export const toast = {
  show(payload: { type?: ToastType; title?: string; message: string; duration?: number }) {
    if (typeof document !== "undefined") mount();
    const id = Math.random().toString(36).slice(2);
    push({ id, type: payload.type || "info", title: payload.title, message: payload.message, duration: payload.duration });
    return id;
  },
  success(message: string, title?: string, duration?: number) {
    return toast.show({ type: "success", title, message, duration });
  },
  info(message: string, title?: string, duration?: number) {
    return toast.show({ type: "info", title, message, duration });
  },
  warning(message: string, title?: string, duration?: number) {
    return toast.show({ type: "warning", title, message, duration });
  },
  error(message: string, title?: string, duration?: number) {
    return toast.show({ type: "error", title, message, duration });
  },
  dismiss(id: string) {
    remove(id);
  },
};

function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    const l = (i: ToastItem[]) => setList(i);
    listeners.push(l);
    return () => {
      const idx = listeners.indexOf(l);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);
  return (
    <>
      <style>
        {`
        .rm-toast-wrap{position:fixed;top:12px;right:12px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none}
        .rm-toast{min-width:280px;max-width:360px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:10px 12px;display:flex;align-items:flex-start;gap:10px;pointer-events:auto;animation:rm-fade-in .16s ease-out}
        .rm-toast-title{font-weight:600;font-size:14px;color:#111827}
        .rm-toast-msg{font-size:13px;color:#374151}
        .rm-toast-close{margin-left:auto;border:none;background:transparent;color:#6b7280;font-size:16px;cursor:pointer}
        .rm-toast-success{border-left:4px solid #10b981}
        .rm-toast-info{border-left:4px solid #3b82f6}
        .rm-toast-warning{border-left:4px solid #f59e0b}
        .rm-toast-error{border-left:4px solid #ef4444}
        @keyframes rm-fade-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        `}
      </style>
      <div className="rm-toast-wrap">
        {list.map((t) => (
          <div key={t.id} className={`rm-toast rm-toast-${t.type}`}>
            <div style={{ display: "grid", gap: 4 }}>
              {t.title && <div className="rm-toast-title">{t.title}</div>}
              <div className="rm-toast-msg">{t.message}</div>
            </div>
            <button className="rm-toast-close" onClick={() => toast.dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}
