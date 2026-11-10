import { fieldGeometry, fieldSurface, fieldBorder, fieldWidth } from "./fieldStyles";

// Field dimensions stay literal at every breakpoint, including adornments.
const Input = ({ prop, className, leading, trailing }) => {
  const hasError = prop.error === true;
  const useForeground = prop.foreground === true;

  return (
    <div className={`${className} relative ${fieldWidth} my-1`}>
      <input
        ref={prop.inputRef}
        id={prop.id}
        name={prop.name}
        value={prop.value ? `${prop.value}` : ""}
        onChange={(e) => prop.onChangeFn(e.target.value)}
        onFocus={prop.onFocusFn}
        onBlur={prop.onBlurFn}
        autoComplete={prop.autoComplete}
        autoFocus={prop.autoFocus}
        type={prop.type}
        placeholder={prop.placeholder}
        readOnly={prop.readOnly}
        disabled={prop.disabled}
        aria-busy={prop.ariaBusy ? "true" : undefined}
        required
        style={{ "--input-bg": prop.bg ?? "var(--input-background)" }}
        className={`
          ${fieldGeometry}
          ${leading ? "pl-9" : ""}
          ${trailing ? "pr-10" : ""}
          ${
            useForeground
              ? "cursor-wait border-[var(--foreground)] bg-[var(--foreground)] text-[var(--text-foreground)] placeholder:text-[var(--text-foreground)]/70 hover:border-[var(--foreground)] focus:border-primary"
              : hasError
                ? "border-negative/50 bg-negative/10 text-[var(--text)] placeholder:text-[var(--input-placeholder)] focus:border-negative/80"
                : `${fieldSurface} ${fieldBorder} bg-[var(--input-bg)]`
          }
        `}
      />
      {leading && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {leading}
        </div>
      )}
      {trailing && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {trailing}
        </div>
      )}
    </div>
  );
};

export default Input;
