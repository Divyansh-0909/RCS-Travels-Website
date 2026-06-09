const Button = ({ prop, className, children }) => {
  const isDropdown = prop.variant === "dropdown";
  const hasError = prop.error === true && !isDropdown;

  return (
    <div
      className={`
        ${className}
        flex items-center justify-center
        font-medium text-default text-white my-1 cursor-pointer
        ${
          prop.variant
            ? isDropdown
              ? "border-2 border-[rgba(187,176,250,0.2)] bg-black shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]"
              : hasError
              ? "border-b-2 border-[rgba(255,0,0,0.3)] bg-var(--background-primary) bg-[linear-gradient(to_top,transparent_50%,rgba(255,0,0,0.25)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]"
              : "border-b-2 border-[rgba(255,255,255,0.05)] bg-var(--background-primary) bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]"
            : "bg-primary-gradient shadow-[inset_0_0px_6px_rgba(255,255,255,0.2)]"
        }
      `}
      style={{
        width: prop.width ?? "275px",
        borderRadius: prop.rounded ?? "20px",
      }}
    >
      <button
        type={prop.type ?? "button"}
        className={`
          flex items-center px-4 py-2 w-[97%] h-[80%] cursor-pointer
          ${isDropdown ? "justify-start" : "justify-center"}
          ${
            !prop.variant
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