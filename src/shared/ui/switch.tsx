import React from "react";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
};

export function Switch({ checked, onChange, disabled, size = "md", ariaLabel }: Props) {
  const w = size === "sm" ? 36 : 44;
  const h = size === "sm" ? 20 : 24;
  const p = size === "sm" ? 2 : 3;
  const knob = h - p * 2;
  const bg = disabled ? "var(--rm-border)" : checked ? "var(--rm-accent)" : "var(--rm-switch-off-bg)";
  const dotBg = "#fff";
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          border: "1px solid var(--rm-border)",
          background: bg,
          display: "inline-flex",
          alignItems: "center",
          padding: p,
          boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background .18s ease",
        }}
      >
        <span
          style={{
            width: knob,
            height: knob,
            borderRadius: "999px",
            background: dotBg,
            boxShadow: "0 2px 6px rgba(0,0,0,.12)",
            transform: `translateX(${checked ? w - knob - p * 2 : 0}px)`,
            transition: "transform .18s ease",
          }}
        />
      </button>
    </>
  );
}
