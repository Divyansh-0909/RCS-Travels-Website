import Button from "../../components/ui/button";

const BackgroundPanel = ({prop,className,children})=>{
    return (
        <div className={`${className} absolute bottom-0 bg-transparent shadow-[inset_0px_2px_4px_rgba(255,255,255,0.25),0px_0px_90px_25px_rgba(0,0,0,0.25)] rounded-t-4xl sm:rounded-none sm:h-[100vh] w-[100vw] bg-panel-gradient`}>
            {children}
        </div>
    )
}

export default BackgroundPanel