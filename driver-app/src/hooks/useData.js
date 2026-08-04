import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useData = create(persist(set => ({
    phone: "",
    setPhone: (number) => set(() => ({ phone: number })),

    name: null,
    setName: (name) => set(() => ({ name: name })),
}),
{
    name: 'rcs-captain',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({ phone: state.phone }),
}))
