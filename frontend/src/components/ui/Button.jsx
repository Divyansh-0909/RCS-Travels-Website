/**
 * @param {object} props
 * @param {{
 *   variant?: string,
 *   width?: string,
 *   rounded?: string,
 *   paddingX?: string,
 *   bg?: string,
 *   type?: string,
 *   error?: boolean,
 *   disabled?: boolean,
 *   innerClassName?: string,
 * }} props.prop - variant/style configuration bag
 * @param {string} [props.className]
 * @param {import("react").ReactNode} [props.children]
 * @param {() => void} [props.onClick]
 */
const Button = ({ prop, className, children, onClick }) => {
  const isDropdown = prop.variant === "dropdown";
  const isInput = prop.variant === "input";
  const isNegative = prop.variant === "negative";
  const hasError = prop.error === true && !isDropdown;
  const isDisabled = prop.disabled === true;
  const isSolid = !prop.variant || isNegative;

  return (
    <div
      className={`
        ${className}
        ${isInput ? "w-fit" : ""}
        flex items-center justify-center
        ${isSolid ? "font-semibold" : "font-medium"} text-default text-[var(--text)] my-1
        ${isDisabled ? "opacity-40 cursor-not-allowed" : isDropdown ? "" : "cursor-pointer"}
        ${
          isSolid
            ? `${isNegative ? "bg-negative" : "bg-primary"} transition-opacity duration-300 ${isDisabled ? "" : "hover:opacity-[0.9] active:opacity-[0.8]"}`
            : isDropdown
            ? "border border-[var(--foreground)]/15 bg-[var(--background)] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] px-4"
            : hasError
            ? "border border-negative/50 bg-negative/10 transition-colors duration-300"
            : `border border-[var(--foreground)]/30 bg-[var(--btn-bg,transparent)] transition-colors duration-300 ${isDisabled ? "" : "hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/15"}`
        }
      `}
      style={{
        "--btn-bg": prop.bg,
        width: prop.width ?? (isInput ? undefined : "290px"),
        borderRadius: prop.rounded ?? (isDropdown ? "16px" : "12px"),
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
          ${prop.innerClassName ? "" : (isDropdown ? "justify-start" : "justify-center")}
          rounded-[inherit] outline-none
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70
        `}
      >
        {children}
      </button>
    </div>
  );
};

export default Button;
