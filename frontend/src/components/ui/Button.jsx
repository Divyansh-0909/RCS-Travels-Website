const Button = ({prop,className,children})=>{
    return (
        <>
            <div
                className={`${className} flex justify-center items-center font-medium text-default text-white my-1 ${
                    prop.variant ? ` ${prop.variant === "dropdown" ? "border-2 border-[rgba(255,255,255,0.2)] bg-black shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]" : "border-b-2  border-[rgba(255,255,255,0.05)] bg-black/50 bg-[linear-gradient(to_top,rgba(44,44,42,0.0),rgba(146,146,139,0.25))] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]"} ` : "bg-primary-gradient shadow-[inset_0_0px_6px_rgba(255,255,255,0.2)]"
                }`}
                style={{ width: prop.width ?? "275px", borderRadius: prop.rounded ?? "20px"}}
            >
                <button onSubmit={prop.type === 'submit' ?? (() => prop.onSubmit()) } type={prop.type ? `${prop.type}` : "button"} className={` flex items-center px-4 py-2 w-[97%] h-[80%] ${prop.variant === "dropdown" ? "justify-left" : "justify-center"} ${prop.variant ? " " : "bg-[linear-gradient(200deg,rgba(255,255,255,0.30)_5%,transparent_20%),linear-gradient(30deg,rgba(0,0,0,0.20)_5%,transparent_20%)]"} rounded-full`}>
                    {children}
                </button>
            </div>
        </>
    );
};

export default Button