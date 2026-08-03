import { Text, View } from 'react-native';
import AppBar from './components/AppBar';

// The home screen, and nothing more. main.tsx owns the router and everything
// that has to sit above every screen — the same split the website uses.
const App = () => {
    return (
        <View className='relative h-full flex flex-col items-center'>
            <AppBar/>
            <View>
                <Text>RCS Travels Drivers App</Text>
            </View>
        </View>
    )
}

export default App
