const REGULAR_INDIAN_PLATE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/;
const BH_PLATE = /^\d{2}BH(?!0000)\d{4}[A-HJ-NP-Z]{1,2}$/;
const BH_PREFIX = /^\d{2}BH/;
const MODERN_PREFIX = /^[A-Z]{2}\d{1,2}/;
const ALLOWED_INPUT = /^[A-Z0-9\s-]+$/i;

export const VEHICLE_NUMBER_MIN_LENGTH = 4;
export const VEHICLE_NUMBER_MAX_LENGTH = 16;
// The field also permits spaces and hyphens for readability, so its raw input
// limit is slightly larger than the canonical registration-number limit.
export const VEHICLE_NUMBER_INPUT_MAX_LENGTH = 20;

export type VehicleNumberValidation =
  | {
      valid: true;
      number: string;
      type: 'regular' | 'bh' | 'legacy_or_special';
      requiresManualVerification: boolean;
    }
  | {
      valid: false;
      number: string;
      type: 'invalid';
      reason: 'missing' | 'too_short' | 'too_long' | 'characters' | 'format' | 'bh_format';
    };

export function normalizeVehicleNumber(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function validateVehicleNumber(value: string): VehicleNumberValidation {
  const number = normalizeVehicleNumber(value);

  if (!number) {
    return { valid: false, number, type: 'invalid', reason: 'missing' };
  }

  if (number.length < VEHICLE_NUMBER_MIN_LENGTH) {
    return { valid: false, number, type: 'invalid', reason: 'too_short' };
  }

  if (number.length > VEHICLE_NUMBER_MAX_LENGTH) {
    return { valid: false, number, type: 'invalid', reason: 'too_long' };
  }

  if (!ALLOWED_INPUT.test(value) || !/^[A-Z0-9]+$/.test(number)) {
    return {
      valid: false,
      number,
      type: 'invalid',
      reason: ALLOWED_INPUT.test(value) ? 'format' : 'characters',
    };
  }

  if (!/[A-Z]/.test(number) || !/\d/.test(number)) {
    return { valid: false, number, type: 'invalid', reason: 'format' };
  }

  // BH has a tightly defined syntax. If the value clearly starts like a BH plate,
  // do not let a malformed BH number fall through as a legacy/special plate.
  if (BH_PREFIX.test(number)) {
    if (!BH_PLATE.test(number)) {
      return { valid: false, number, type: 'invalid', reason: 'bh_format' };
    }

    return {
      valid: true,
      number,
      type: 'bh',
      requiresManualVerification: true,
    };
  }

  if (REGULAR_INDIAN_PLATE.test(number)) {
    return {
      valid: true,
      number,
      type: 'regular',
      requiresManualVerification: false,
    };
  }

  // A value that begins exactly like a modern registration but violates the
  // remaining shape (for example, five trailing digits) is most likely a typo.
  if (MODERN_PREFIX.test(number)) {
    return { valid: false, number, type: 'invalid', reason: 'format' };
  }

  // Older and special registrations vary enough that the RC/document review is
  // the authoritative check. Keep plausible alphanumeric values moving forward.
  return {
    valid: true,
    number,
    type: 'legacy_or_special',
    requiresManualVerification: true,
  };
}
