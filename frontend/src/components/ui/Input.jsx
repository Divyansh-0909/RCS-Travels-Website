// leading (decorative, e.g. marker dot) and trailing (interactive, e.g. clear
// button) render inside the field. Transforms live on the wrapper so the
// input and adornments scale together.
const Input = ({ prop, className, leading, trailing }) => {
  const hasError = prop.error === true;

  return (
    <div className={`${className} relative w-fit my-1 sm:scale-y-[1.3]`}>
      <input
        id={prop.id}
        name={prop.name}
        value={prop.value ? `${prop.value}` : ""}
        onChange={(e) => prop.onChangeFn(e.target.value)}
        onFocus={prop.onFocusFn}
        onBlur={prop.onBlurFn}
        autoComplete={prop.autoComplete}
        type={prop.type}
        placeholder={prop.placeholder}
        required
        style={{ "--input-bg": prop.bg }}
        className={`
          font-medium text-default text-[var(--text)]
          px-4 py-2 w-[290px] rounded-xl
          ${leading ? "pl-9" : ""}
          ${trailing ? "pr-10" : ""}
          border outline-none
          placeholder:text-[var(--foreground-muted)]/50
          transition-colors duration-300
          ${
            hasError
              ? "border-negative/50 bg-negative/10 focus:border-negative/80"
              : "border-[var(--foreground)]/30 bg-[var(--input-bg,transparent)] hover:border-[var(--foreground)]/50 focus:border-[var(--foreground)]/60 focus:bg-[var(--foreground)]/5"
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
