import {create} from 'zustand'

export const useData = create (set =>({
    phone: "",
    setPhone: (number)=> set (state => ({phone: number})),

    pickupLocation: null,
    setPickup: (location)=> set (state => ({pickupLocation: location})),

    dropLocation: null,
    setDrop: (location)=> set (state => ({dropLocation: location})),

    scheduledTime: null,
    setScheduledTime: (time)=> set(state=> ({scheduledTime: time})),

    fare: null,
    setFare: (fare)=> set(state=> ({fare: fare})),

    vehicleType: 4,
    setvehicleType: (vehicle)=> set(state=> ({vehicleType: vehicle})),

    username: null,
    setUsername: (name)=> set(state=> ({username: name})),

    sharing: true,
    setSharing: (share) => set(state=>({sharing: share})),
}))