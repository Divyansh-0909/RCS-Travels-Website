const Button = ({variant,children})=>{
    return (
        <>
            <div
                className={`flex justify-center items-center font-medium text-default w-[80vw] rounded-full text-white my-2 ${
                    variant ? "bg-black" : "bg-primary-gradient shadow-[inset_0_0px_6px_rgba(255,255,255,0.2)]"
                }`}
            >
                <div className=" flex justify-center items-center py-2 w-[98%] h-[80%] bg-[linear-gradient(200deg,rgba(255,255,255,0.25)_5%,transparent_20%),linear-gradient(30deg,rgba(0,0,0,0.15)_5%,transparent_20%)] rounded-full">
                    {children}
                </div>
            </div>
        </>
    );
};

export default Button