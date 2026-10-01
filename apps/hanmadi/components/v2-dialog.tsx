"use client";
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";

export function Dialog({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const outsideStart = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    const trigger = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  function outside(event: PointerEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false;
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
  }
  return (
    <dialog className="hm-dialog" ref={ref} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onPointerDown={event => { outsideStart.current = outside(event); }}
      onPointerCancel={() => { outsideStart.current = false; }}
      onPointerUp={event => {
        const dismiss = outsideStart.current && outside(event);
        outsideStart.current = false;
        if (dismiss) { event.stopPropagation(); onClose(); }
      }}>
      <div className="hm-row hm-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div className="hm-dialog-body">{children}</div>
    </dialog>
  );
}
