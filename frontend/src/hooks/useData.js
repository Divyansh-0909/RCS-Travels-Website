import {create} from 'zustand'

export const useData = create (set =>({
    phone: "",
    setPhone: (number)=> set (state => ({phone: number})),

    pickupLocation: "Inner Gate, Shiv Nadar",
    setPickup: (location)=> set (state => ({pickupLocation: location})),

    dropLocation: null,
    setDrop: (location)=> set (state => ({dropLocation: location})),

    scheduledTime: null,
    setScheduledTime: (time)=> set(state=> ({scheduledTime: time})),

    fare: 300,
    setFare: (fare)=> set(state=> ({fare: fare})),

    vehicleType: 4,
    setvehicleType: (vehicle)=> set(state=> ({vehicleType: vehicle})),

    bookingId: 12,
    setBookingId: (id)=> set(state=> ({bookingId: id})),

    bookingCode: null,
    setBookingCode: (code)=> set(state=> ({bookingCode: code})),

    status: "confirmed",
    setStatus: (status)=> set(state=> ({status: status})),

    username: null,
    setUsername: (name)=> set(state=> ({username: name})),

    sharing: true,
    setSharing: (share) => set(state=>({sharing: share})),
}))