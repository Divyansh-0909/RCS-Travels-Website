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
      className={`
        ${className}
        font-medium text-default text-[var(--text)] my-1
        px-4 py-2 w-[290px] rounded-xl
        bg-transparent border outline-none
        placeholder:text-[var(--foreground-muted)]/50
        transition-colors duration-300
        ${
          hasError
            ? "border-red-500/50 bg-red-500/10 focus:border-red-500/80"
            : "border-[var(--foreground)]/30 hover:border-[var(--foreground)]/50 focus:border-[var(--foreground)]/60 focus:bg-[var(--foreground)]/5"
        }
      `}
    />
  );
};

export default Input;
