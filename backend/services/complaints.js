/**
 * Complaints remain factual rider reports. They may inform a later responsibility
 * case, but their existence is not authorization for a fine, strike, or block.
 */
export async function summarizeComplaintIncident(tx, driverId) {
  const complaints = await tx.rideComplaint.count({ where: { driverId } })
  return {
    complaints,
    reviewRequired: true,
    consequenceApplied: false,
  }
}
