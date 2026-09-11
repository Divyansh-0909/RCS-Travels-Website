// leading (decorative, e.g. marker dot) and trailing (interactive, e.g. clear
// button) render inside the field. Transforms live on the wrapper so the
// input and adornments scale together.
const Input = ({ prop, className, leading, trailing }) => {
  const hasError = prop.error === true;
  const useForeground = prop.foreground === true;

  return (
    <div className={`${className} relative w-fit max-sm:w-[86vw] max-sm:max-w-full my-1 sm:scale-y-[1.3]`}>
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
        aria-busy={prop.ariaBusy ? "true" : undefined}
        required
        style={{ "--input-bg": prop.bg }}
        className={`
          font-medium text-default
          px-4 py-2 w-[290px] max-sm:w-full rounded-xl
          ${leading ? "pl-9" : ""}
          ${trailing ? "pr-10" : ""}
          border outline-none
          transition-colors duration-300
          ${
            useForeground
              ? "cursor-wait border-[var(--foreground)] bg-[var(--foreground)] text-[var(--text-foreground)] placeholder:text-[var(--text-foreground)]/70 hover:border-[var(--foreground)] focus:border-[var(--foreground)]"
              : hasError
                ? "border-negative/50 bg-negative/10 text-[var(--text)] placeholder:text-[var(--foreground-muted)]/50 focus:border-negative/80"
                : "border-[var(--foreground)]/30 bg-[var(--input-bg,transparent)] text-[var(--text)] placeholder:text-[var(--foreground-muted)]/50 hover:border-[var(--foreground)]/50 focus:border-primary"
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
