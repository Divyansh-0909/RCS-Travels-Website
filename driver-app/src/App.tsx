import { View } from 'react-native';
import { Outlet } from 'react-router-native';
import AppBar from './components/AppBar';
import OnlineToggle from './components/OnlineToggle';

const App = () => {
    return (
        <View className='relative w-full h-full bg-[var(--foreground)] pt-16 pb-32 flex flex-col justify-center items-center'>
            <OnlineToggle visible={true} />
            <Outlet/>
            <AppBar/>
        </View>
    )
}

export default App
