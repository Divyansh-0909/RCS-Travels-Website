import { useViewNavigate } from "../hooks/useViewNavigate"

const FinalCTA = () => {
    const navigate = useViewNavigate()
    
    const data = [
        {
            title: "Sign up to book a ride",
            description: "Click here to",

        },
        {
            title: "Drive for us",
            description: "Scan the QR to download the drivers app",
        }
    ]

    return (
        <div className="flex flex-col items-center gap-6 py-5 pb-20 bg-[var(--foreground)] text-[var(--text-foreground)]">
            <ul className="flex flex-col sm:flex-row gap-10 sm:gap-3 justify-between items-center w-[82%] md:w-[90%] xl:w-[74%]">
                {data.map((item, index) => {
                    return (
                        <li key={index} className="sm:w-[46%] w-full flex flex-col items-start justify-center gap-2 p-5 bg-[var(--foreground-muted)] rounded-xl">
                            <h2 className="font-semibold text-[var(--text-foreground)]">{item.title}</h2>
                            <h3 className="text-[var(--text-foreground)] flex gap-1">{item.description} <span onClick={()=>navigate("/signup")} className={`${index === 0 ? "block" : "hidden"} underline text-primary cursor-pointer`}>sign up</span></h3>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export default FinalCTA