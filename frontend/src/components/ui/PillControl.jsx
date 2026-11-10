import { forwardRef } from "react";

const PillControl = forwardRef(function PillControl({ children, className = "", faceClassName = "", faceStyle, disabled, ...props }, ref) {
  return (
    <button type="button" {...props} ref={ref} disabled={disabled} data-size="pill" className={`group relative inline-flex min-h-11 max-w-full shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      <span data-pill-face style={faceStyle} className={`inline-flex min-h-9 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium leading-5 transition-colors duration-150 group-active:opacity-80 motion-reduce:transition-none ${faceClassName}`}>
        {children}
      </span>
    </button>
  );
});
export default PillControl;
