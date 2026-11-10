import BrandWordmark from './ui/BrandWordmark';

const LoadingScreen = ()=>{
    return (
        <div className="flex flex-col justify-center items-center h-[100dvh] w-[100vw] bg-white dark:bg-[var(--background-primary)] text-black dark:text-white">
            <BrandWordmark as="h1" size="text-5xl sm:text-8xl" strongClassName="font-bold" className="tracking-tight" />
        </div>
    );
};

export default LoadingScreen
