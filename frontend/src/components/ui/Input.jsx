const Input = ({ prop, className }) => {
  const hasError = prop.error === true;

  return (
    <input
      id={prop.id}
      name={prop.name}
      value={prop.value ? `${prop.value}` : ""}
      onChange={(e) => prop.onChangeFn(e.target.value)}
      type={prop.type}
      placeholder={prop.placeholder}
      required
      style={{ "--input-bg": prop.bg }}
      className={`
        ${className}
        font-medium text-default text-[var(--text)] my-1
        px-4 py-2 w-[290px] rounded-xl
        border outline-none
        placeholder:text-[var(--foreground-muted)]/50
        transition-colors duration-300
        sm:scale-y-[1.3]
        ${
          hasError
            ? "border-negative/50 bg-negative/10 focus:border-negative/80"
            : "border-[var(--foreground)]/30 bg-[var(--input-bg,transparent)] hover:border-[var(--foreground)]/50 focus:border-[var(--foreground)]/60 focus:bg-[var(--foreground)]/5"
        }
      `}
    />
  );
};

export default Input;
