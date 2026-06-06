import mobileBackgroundIllustration from "../assets/Mobile.webp"
import laptopBackgroundIllustration from "../assets/Laptop.webp"
import Button from "../components/ui/button";

const OnBoarding = ()=>{
    return (
        <div className="relative flex flex-col w-[100vw] h-[100vh] items-center">
            <div className="relative z-10 py-10 flex flex-col items-center h-[inherit] justify-between">    
                <h3 className="text-black bg-white font-semibold px-4 py-2 rounded-full">RCS travels</h3>
                <div className="flex flex-col text-center justify-center items-center gap-2 pb-3 ">
                    <h2 className="text-white">Welcome!</h2>
                    <p className="text-white-muted">App for making your daily travel <br /> as convenient and smooth as possible</p>
                    <Button> Access your account </Button>
                    <p className="text-white-muted">Don’t have an account? <span className="text-medium text-white">Signup</span></p>
                    
                </div>
            </div>
            
            <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100vh] bg-[linear-gradient(to_top,var(--background)_20%,transparent_60%)]"/>
            <img src={mobileBackgroundIllustration} alt="background-illustration" className="absolute z-0 w-full h-full object-top object-cover bg-gradient" />
        </div>
    );
};

export default OnBoarding