// ---- Tests get their own database, so they never wipe or pollute the demo data ----

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://seatase:seatase@localhost:5432/seatase_test';
