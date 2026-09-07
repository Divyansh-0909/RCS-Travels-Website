import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useViewNavigate } from "../hooks/useViewNavigate"
import { useWebsiteCopy } from "../hooks/useWebsiteCopy"

const FinalCTA = () => {
    useCopyLanguage();
    const tr = useWebsiteCopy()
    const navigate = useViewNavigate()
    
    const data = [
        {
            get "title"() { return dc("Drive for us"); },
            get "description"() { return dc("Scan the QR to download the drivers app"); },
        }
    ]

    return (
        <div className="flex flex-col items-center gap-6 bg-[var(--foreground)] text-[var(--text-foreground)]">
            <ul className="flex flex-col sm:flex-row gap-10 sm:gap-3 justify-between items-center w-[82%] md:w-[90%] xl:w-[74%]">
                {data.map((item, index) => {
                    return (
                        <li key={index} className="sm:w-[46%] w-full flex flex-col items-start justify-center gap-2 p-5 bg-[var(--foreground-muted)] rounded-xl">
                            <h2 className="break-words text-2xl sm:text-3xl font-semibold text-[var(--text-foreground)]">{tr(item.title)}</h2>
                            <h3 className="flex flex-wrap gap-1 text-lg sm:text-xl leading-[1.75] text-[var(--background-primary)]/65">{tr(item.description)} <span onClick={()=>navigate("/signup")} className={`${index === 0 ? "block" : "hidden"} underline text-primary cursor-pointer`}>{tr("sign up")}</span></h3>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export default FinalCTA
