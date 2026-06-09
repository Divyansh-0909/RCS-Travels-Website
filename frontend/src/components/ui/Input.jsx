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
        flex justify-start items-center font-medium text-default text-white my-1
        px-4 py-2 w-[275px] rounded-full
        ${
          hasError
            ? `
              border-b-2 border-[rgba(255,0,0,0.3)]
              bg-var(--background-primary)
              bg-[linear-gradient(to_top,transparent_50%,rgba(255,0,0,0.25)_100%)]
              shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]
              focus:border-[rgba(255,0,0,0.5)]
              focus:shadow-[inset_0_2px_2px_rgba(255,255,255,0.35)]
            `
            : `
              border-b-2 border-[rgba(255,255,255,0.05)]
              bg-var(--background-primary)
              bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)]
              shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]
              focus:border-[rgba(255,255,255,0.15)]
              focus:shadow-[inset_0_2px_2px_rgba(255,255,255,0.35)]
            `
        }
        focus:outline-none
        focus:bg-black
        transition-all duration-200
      `}
    />
  );
};

export default Input;