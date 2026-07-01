import {create} from 'zustand'

export const useData = create (set =>({
    phone: "",
    setPhone: (number)=> set (state => ({phone: number})),

    pickupLocation: "",
    setPickup: (location)=> set (state => ({pickupLocation: location})),

    dropLocation: null,
    setDrop: (location)=> set (state => ({dropLocation: location})),

    scheduledTime: null,
    setScheduledTime: (time)=> set(state=> ({scheduledTime: time})),

    timing: "Schedule",
    setTiming: (timing)=> set(state=> ({timing: timing})),

    fare: null,
    setFare: (fare)=> set(state=> ({fare: fare})),

    vehicleType: null,
    setvehicleType: (vehicle)=> set(state=> ({vehicleType: vehicle})),

    bookingId: null,
    setBookingId: (id)=> set(state=> ({bookingId: id})),

    bookingCode: null,
    setBookingCode: (code)=> set(state=> ({bookingCode: code})),

    status: "",
    setStatus: (status)=> set(state=> ({status: status})),

    // Shape: { id, code, status, pickupAddress, dropAddress, fare, scheduledAt }
    activeBooking: null,
    setActiveBooking: (booking)=> set(state=> ({activeBooking: booking})),

    cancelledBy: null,
    setCancelledBy: (by)=> set(state=> ({cancelledBy: by})),

    username: null,
    setUsername: (name)=> set(state=> ({username: name})),

    sharing: true,
    setSharing: (share) => set(state=>({sharing: share})),
}))