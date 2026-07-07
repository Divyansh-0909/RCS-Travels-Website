import {create} from 'zustand'
import {persist, createJSONStorage} from 'zustand/middleware'

export const useData = create (persist (set =>({
    phone: "",
    setPhone: (number)=> set (state => ({phone: number})),

    username: null,
    setUsername: (name)=> set(state=> ({username: name})),

    language: "English",
    setLanguage: (lang)=> set(state=> ({language: lang})),

    gender: null,
    setGender: (sex)=>set(state=>({gender: sex})),

    emergencyContact: null,
    setEmergencyContact: (number)=>set(state=>({emergencyContact: number})),

    dob: null,
    setDOB: (date)=>set(state=>({dob: date})),

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

    sharing: true,
    setSharing: (share) => set(state=>({sharing: share})),
}),
{
    name: 'rcs-data',
    storage: createJSONStorage(() => localStorage),
    // Only the phone number is remembered across reloads/return visits so a
    // returning user's login form is pre-filled; everything else stays in-memory.
    partialize: (state) => ({ phone: state.phone, language: state.language }),
}))