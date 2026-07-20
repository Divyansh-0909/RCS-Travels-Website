const Button = ({ prop, className, children, onClick }) => {
  const isDropdown = prop.variant === "dropdown";
  const isInput = prop.variant === "input";
  const isNegative = prop.variant === "negative";
  const hasError = prop.error === true && !isDropdown;
  const isDisabled = prop.disabled === true;

  return (
    <div
      className={`
        ${className}
        ${isInput ? "w-fit" : ""}
        flex items-center justify-center
        font-medium text-default text-[var(--text)] my-1 transition-opacity duration-300
        ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer opacity-[1] hover:opacity-[0.8]"}
        ${
          isNegative
            ? "bg-negative-gradient shadow-[inset_0_0px_6px_rgba(255,255,255,0.2)]"
            : prop.variant
            ? isDropdown
              ? "border-2 border-[rgba(187,176,250,0.2)] bg-[var(--background)] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] px-4"
              : hasError
              ? "border-b-2 border-[rgba(239,68,68,0.3)] bg-var(--background-primary) bg-[linear-gradient(to_bottom,transparent_50%,rgba(239,68,68,0.25)_100%)] shadow-[inset_0_2px_2px_rgba(239,68,68,0.35)]"
              : "border-b-2 border-[rgba(255,255,255,0.05)] bg-var(--background-primary) bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]"
            : "bg-primary-gradient shadow-[inset_0_0px_6px_rgba(255,255,255,0.2)]"
        }
      `}
      style={{
        width: prop.width ?? (isInput ? undefined : "290px"),
        borderRadius: prop.rounded ?? "20px",
        paddingLeft: prop.paddingX,
        paddingRight: prop.paddingX,
      }}
    >
      <button
        type={prop.type ?? "button"}
        onClick={onClick}
        disabled={isDisabled}
        className={` ${prop.innerClassName}
          flex items-center py-2 w-[97%] h-[80%] ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}
          ${prop.innerClassName ?"" : (isDropdown ? "justify-start" : "justify-center")}
          ${
            !prop.variant || isNegative
              ? "bg-[linear-gradient(200deg,rgba(255,255,255,0.30)_5%,transparent_20%),linear-gradient(30deg,rgba(0,0,0,0.20)_5%,transparent_20%)]"
              : ""
          }
          rounded-full
        `}
      >
        {children}
      </button>
    </div>
  );
};

export default Button;