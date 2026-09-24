// The RoBenDevs brief's own story. Seed data, tests, README credentials and the video
// all read from this one file, so the cast can never drift apart between them.

export const DEFAULT_PASSWORD = 'password123';

export const PASSENGERS = [
  {
    name: 'Nusrat',
    phone: '01700000030',
    password: DEFAULT_PASSWORD,
    gender: 'FEMALE',
    nid: '1234567890',
    trip: { pickupZone: 'Banani', dropZone: 'Mohakhali', seats: 1 },
  },
  {
    name: 'Rafiq',
    phone: '01700000031',
    password: DEFAULT_PASSWORD,
    gender: 'MALE',
    nid: '1234567891',
    trip: { pickupZone: 'Banani', dropZone: 'Gulshan 1', seats: 1 },
  },
  {
    name: 'Shirin',
    phone: '01700000032',
    password: DEFAULT_PASSWORD,
    gender: 'FEMALE',
    nid: '1234567892',
    trip: { pickupZone: 'Banani', dropZone: 'Mohakhali', seats: 1, womenOnly: true },
  },
];

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
