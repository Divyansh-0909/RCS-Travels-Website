export type MarketplaceStatus = 'open' | 'claimed' | 'completed' | 'cancelled';

export type MarketplaceListing = {
    id: string;
    pickupAddress: string;
    dropAddress: string;
    scheduledAt: string;
    fare: number;
    deposit: number;
    vehicleClass: string;
    status: MarketplaceStatus;
    mine: boolean;
    /** Private fields, revealed only after a successful marketplace deposit hold. */
    riderName?: string;
    riderPhone?: string;
};

export const MARKETPLACE_POSTER_FEE_RATE = 0.10;
export const MARKETPLACE_CANCELLATION_RATE = 0.12;

export const MARKETPLACE_STATUS: Record<MarketplaceStatus, { label: string; fill: string; ink: string }> = {
    open: { label: 'Open', fill: '#243AFB', ink: 'text-white' },
    claimed: { label: 'Claimed', fill: '#92400E', ink: 'text-white' },
    completed: { label: 'Completed', fill: '#166534', ink: 'text-white' },
    cancelled: { label: 'Cancelled', fill: '#4B5563', ink: 'text-white' },
};

/**
 * Representative rows for UI development only. The marketplace service is not in
 * this repository yet; release builds therefore render the truthful empty state
 * instead of inventing bookings for captains.
 */
export const marketplaceListings = (): MarketplaceListing[] => {
    if (!__DEV__) return [];

    const at = (days: number, hours: number, minutes = 0) => {
        const date = new Date();
        date.setDate(date.getDate() + days);
        date.setHours(hours, minutes, 0, 0);
        return date.toISOString();
    };

    return [
        {
            id: 'preview-open-1',
            pickupAddress: 'Raj Nagar Extension, Ghaziabad',
            dropAddress: 'Tajganj, Agra',
            scheduledAt: at(1, 6),
            fare: 4200,
            deposit: 400,
            vehicleClass: 'suv',
            status: 'open',
            mine: false,
        },
        {
            id: 'preview-open-2',
            pickupAddress: 'Sector 62, Noida',
            dropAddress: 'C Scheme, Jaipur',
            scheduledAt: at(2, 5, 30),
            fare: 7800,
            deposit: 900,
            vehicleClass: 'suv_premium',
            status: 'open',
            mine: false,
        },
        {
            id: 'preview-mine-1',
            pickupAddress: 'Indirapuram, Ghaziabad',
            dropAddress: 'Har Ki Pauri, Haridwar',
            scheduledAt: at(3, 7),
            fare: 3100,
            deposit: 250,
            vehicleClass: 'sedan',
            status: 'open',
            mine: true,
        },
        {
            id: 'preview-mine-2',
            pickupAddress: 'IGI Airport Terminal 3, Delhi',
            dropAddress: 'DLF Phase 3, Gurugram',
            scheduledAt: at(4, 13, 15),
            fare: 1450,
            deposit: 150,
            vehicleClass: 'hatchback',
            status: 'claimed',
            mine: true,
        },
    ];
};

export const marketplaceMoney = (listing: MarketplaceListing) => {
    const claimerBase = listing.fare - listing.deposit;
    const posterFee = listing.deposit * MARKETPLACE_POSTER_FEE_RATE;
    const cancellationFee = listing.deposit * MARKETPLACE_CANCELLATION_RATE;

    return {
        claimerBase,
        claimerNet: claimerBase,
        posterFee,
        posterNet: listing.deposit - posterFee,
        cancellationFee,
        cancellationRefund: listing.deposit - cancellationFee,
    };
};
