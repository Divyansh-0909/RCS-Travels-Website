const Input = ({prop,className})=>{
    return (
        <input 
            id={prop.id} 
            name={prop.name} 
            value={prop.value? `${prop.value}` : "" } 
            onChange={(e)=>prop.onChangeFn(e.target.value)}
            type={prop.type}
            placeholder={prop.placeholder} 
            required
            className={` ${className}
            flex justify-left items-center font-medium text-default text-white my-1 
            px-4 py-2 w-[275px] border-b-2 border-[rgba(255,255,255,0.05)] bg-black/50 rounded-full
            bg-[linear-gradient(to_top,rgba(44,44,42,0.0),rgba(146,146,139,0.25))] 
            shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)] focus:outline-none
            focus:border-[rgba(255,255,255,0.15)] focus:shadow-[inset_0_2px_2px_rgba(255,255,255,0.35)]
            focus:bg-black transition-all duration-200
            `}/>
    );
};

export default Input