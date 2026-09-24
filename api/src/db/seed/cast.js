// The RoBenDevs brief's own story. Seed data, tests, README credentials and the video
// all read from this one file, so the cast can never drift apart between them.

export const DEFAULT_PASSWORD = 'password123';

export const DRIVERS = [
  {
    name: 'Jashim',
    phone: '01700000010',
    password: DEFAULT_PASSWORD,
    vehicle: { name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 },
  },
  {
    name: 'Mokbul',
    phone: '01700000011',
    password: DEFAULT_PASSWORD,
    vehicle: { name: 'Toofan', registrationNo: 'DHAKA-METRO-GA-22-2222', capacity: 3 },
  },
];
