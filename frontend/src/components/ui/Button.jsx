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

  // Fluid below sm, fixed from sm up: default-width controls sit on an 86vw
  // rail on phones, with max-w-full so a narrower parent still clips them.
  //
  // A definite length, not min(86vw,100%): several callers put these inside a
  // shrink-to-fit flex column (OnBoarding's booking form), where a percentage
  // has no definite basis to resolve against and collapses the control to its
  // content width. 86vw contributes a real max-content size instead, so the
  // form itself widens to the rail. sm+ keeps the exact pixel value, and
  // dropdowns are absolutely positioned panels that keep their inline width.
  const width = prop.width ?? (isInput ? undefined : "290px");
  const mobileWidth = isDropdown ? ""
    : prop.width ? "max-sm:w-[var(--btn-w)] max-sm:max-w-full"
    : isInput ? ""
    : "max-sm:w-[86vw] max-sm:max-w-full";

  return (
    <div
      className={`
        ${className}
        ${isInput && !width ? "w-fit" : ""}
        ${mobileWidth}
        ${width && !isDropdown ? "sm:w-[var(--btn-w)]" : ""}
        flex items-center justify-center
        ${isSolid ? "font-semibold" : "font-medium"} text-default text-[var(--text)] my-1
        ${isDisabled ? "opacity-40 cursor-not-allowed" : isDropdown ? "" : "cursor-pointer"}
        ${
          isSolid
            ? `${isNegative ? "bg-negative" : "bg-primary"} transition-opacity duration-300 ${isDisabled ? "" : "hover:opacity-[0.9] active:opacity-[0.8]"}`
            : isDropdown
            ? "border border-[var(--foreground)]/15 bg-[var(--background-primary)] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] px-4"
            : hasError
            ? "border border-negative/50 bg-negative/10 transition-colors duration-300"
            : `border ${prop.border === false ? "border-transparent" : "border-[var(--foreground)]/30"} bg-[var(--btn-bg,transparent)] transition-colors duration-300 ${isDisabled ? "" : "hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/15"}`
        }
      `}
      style={{
        "--btn-bg": prop.bg,
        "--btn-w": !isDropdown ? width : undefined,
        width: isDropdown ? width : undefined,
        borderRadius: prop.rounded ?? (isDropdown ? "16px" : "12px"),
        paddingLeft: prop.paddingX,
        paddingRight: prop.paddingX,
      }}
    >
      <button
        type={prop.type ?? "button"}
        // Lets a submit button live outside its <form> — the vehicle screen
        // pins its CTA to the viewport on mobile, where nesting it in the form
        // inside the sheet is exactly what it can't do.
        form={prop.form}
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
