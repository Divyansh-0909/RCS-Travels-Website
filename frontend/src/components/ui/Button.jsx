import { forwardRef } from "react";
import PillControl from "./PillControl";

// One native control keeps primary actions, selectors and switch rows on the
// same type/spacing/focus contract. Callers retain their own colour and shape.
export const ActionControl = forwardRef(function ActionControl({ icon = false, loading = false, disabled = false, className = "", ...props }, ref) {
  return (
    <button
      type="button"
      {...props}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"] || undefined}
      data-size="action"
      className={`inline-flex min-h-12 min-w-12 items-center gap-2 whitespace-normal break-words py-3 ${icon ? "px-3" : "px-6"} text-base leading-6 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed motion-reduce:transition-none ${className}`}
    />
  );
});

/**
 * @param {object} props
 * @param {{
 *   variant?: string,
 *   width?: string,
 *   rounded?: string,
 *   paddingX?: string,
 *   bg?: string,
 *   type?: string,
 *   border?: boolean,
 *   error?: boolean,
 *   disabled?: boolean,
 *   size?: 'action' | 'pill',
 *   loading?: boolean,
 *   innerClassName?: string,
 * }} props.prop - variant/style configuration bag
 * @param {string} [props.className]
 * @param {import("react").ReactNode} [props.children]
 * @param {() => void} [props.onClick]
 * @param {import("react").Ref<HTMLDivElement>} [props.containerRef] - the outer
 *   box, for callers that need to measure or anchor to this control
 * @param {import("react").CSSProperties} [props.style] - merged over the box's
 *   own inline style, for values only the caller can compute (e.g. a measured
 *   position); the caller wins on conflict
 */
const Button = ({ prop = {}, className = "", children, onClick, containerRef, style }) => {
  if (prop.size === "pill") return (
    <div ref={containerRef} className={`relative w-fit max-w-full ${className}`} style={style}>
      <PillControl type={prop.type ?? "button"} onClick={onClick} disabled={prop.disabled || prop.loading} aria-busy={prop.loading || undefined} aria-haspopup={prop["aria-haspopup"]} aria-expanded={prop["aria-expanded"]} aria-label={prop["aria-label"]} faceStyle={{ "--pill-bg": prop.bg ?? "var(--input-background)" }} faceClassName={`bg-[var(--pill-bg)] ${prop.faceClassName ?? "text-ink legacy:text-[var(--text)]"}`}>
        {children}
      </PillControl>
    </div>
  );
  // Controls opt in; rich vehicle cards retain their content-driven geometry.
  const isAction = prop.size === "action";
  const Control = isAction ? ActionControl : "button";
  const isDropdown = prop.variant === "dropdown";
  const isInput = prop.variant === "input";
  const isNegative = prop.variant === "negative";
  const hasError = prop.error === true && !isDropdown;
  const isDisabled = prop.disabled === true || prop.loading === true;
  const isSolid = !prop.variant || isNegative;

  // Fluid below sm, fixed from sm up: default-width controls sit on an 86vw
  // rail on phones, with max-w-full so a narrower parent still clips them.
  //
  // A definite length, not min(86vw,100%): several callers put these inside a
  // shrink-to-fit flex column (OnBoarding's booking form), where a percentage
  // has no definite basis to resolve against and collapses the control to its
  // content width. 86vw contributes a real max-content size instead, so the
  // form itself widens to the rail. sm+ keeps the exact pixel value, and
  // dropdowns are absolutely positioned panels that keep their inline width.
  const width = prop.width ?? (isAction ? "377px" : isInput ? undefined : "290px");
  const mobileWidth = isDropdown ? ""
    : prop.width ? "max-sm:w-[var(--btn-w)] max-sm:max-w-full"
    : isInput ? ""
    : "max-sm:w-[86vw] max-sm:max-w-full";

  return (
    <div
      ref={containerRef}
      className={`
        ${className}
        ${isInput && !width ? "w-fit" : ""}
        ${mobileWidth}
        ${width && !isDropdown ? "sm:w-[var(--btn-w)]" : ""}
        flex items-center justify-center
        ${isSolid ? "font-semibold" : "font-medium"} text-default ${isSolid ? "text-on-primary" : isDropdown ? "text-on-strong" : "text-ink"} legacy:text-[var(--text)] my-1
        ${isDisabled ? "opacity-40 cursor-not-allowed" : isDropdown ? "" : "cursor-pointer"}
        ${
          isSolid
            ? `${isNegative ? "bg-negative" : "bg-primary"} transition-opacity duration-300 ${isDisabled ? "" : "hover:opacity-[0.9] active:opacity-[0.8]"}`
            : isDropdown
            ? "border border-border bg-strong shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] px-4 legacy:border-[var(--foreground)]/15 legacy:bg-[var(--background-primary)]"
            : hasError
            ? "border border-negative/50 bg-negative/10 transition-colors duration-300"
            : `border ${prop.border === false ? "border-transparent" : "border-border legacy:border-[var(--foreground)]/30"} bg-[var(--btn-bg,transparent)] transition-colors duration-300 ${isDisabled ? "" : "hover:bg-surface-muted active:bg-surface-raised legacy:hover:bg-[var(--foreground)]/10 legacy:active:bg-[var(--foreground)]/15"}`
        }
      `}
      style={{
        "--btn-bg": prop.bg,
        "--btn-w": !isDropdown ? width : undefined,
        width: isDropdown ? width : undefined,
        borderRadius: prop.rounded ?? (isDropdown ? "16px" : "12px"),
        paddingLeft: prop.paddingX,
        paddingRight: prop.paddingX,
        ...style,
      }}
    >
      <Control
        type={prop.type ?? "button"}
        // Lets a submit button live outside its <form> — the vehicle screen
        // pins its CTA to the viewport on mobile, where nesting it in the form
        // inside the sheet is exactly what it can't do.
        form={prop.form}
        aria-haspopup={prop["aria-haspopup"]}
        aria-expanded={prop["aria-expanded"]}
        aria-pressed={prop["aria-pressed"]}
        aria-label={prop["aria-label"]}
        aria-busy={prop.loading || undefined}
        aria-invalid={hasError || undefined}
        data-size={isAction ? "action" : undefined}
        onClick={onClick}
        disabled={isDisabled}
        className={` ${prop.innerClassName}
          flex items-center whitespace-normal break-words ${isAction ? "w-full" : "min-h-10 py-2.5 w-[97%]"} ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}
          ${prop.innerClassName ? "" : (isDropdown ? "justify-start" : "justify-center")}
          rounded-[inherit] outline-none
          focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary legacy:focus-visible:outline-[var(--foreground)]/70
        `}
      >
        {children}
      </Control>
    </div>
  );
};

export default Button;
