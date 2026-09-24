// A small offset from the zone's own center so each place has a distinct point.
function near(zone, dLat, dLng) {
  return { lat: zone.centerLat + dLat, lng: zone.centerLng + dLng };
}

/**
 * ~50 real-recognisable Dhaka spots: 1-3 Tesla stands per zone (Banani is small,
 * Uttara is huge) plus a couple of landmarks per zone, for search to find.
 * @param {Map<string, {centerLat:number, centerLng:number}>} zoneByName
 */
export function buildPlaces(zoneByName) {
  const z = (name) => zoneByName.get(name);
  const entries = [
    // Banani — small, one stand
    ['Banani Road 11 police box', 'STAND', 'Banani', 0.0, 0.001],
    ['Banani Rail Crossing', 'LANDMARK', 'Banani', 0.003, -0.002],
    ['Kemal Ataturk Avenue', 'LANDMARK', 'Banani', -0.002, 0.003],

    // Gulshan 1
    ['Gulshan 1 DCC Market stand', 'STAND', 'Gulshan 1', 0.001, 0.001],
    ['Gulshan 1 Circle', 'LANDMARK', 'Gulshan 1', 0.0, -0.001],
    ['Gulshan Society Market', 'LANDMARK', 'Gulshan 1', 0.002, 0.002],

    // Gulshan 2
    ['Gulshan 2 Circle stand', 'STAND', 'Gulshan 2', 0.0, 0.0],
    ['Pink City Gulshan 2', 'LANDMARK', 'Gulshan 2', 0.002, -0.001],
    ['Gulshan 2 Police Plaza', 'LANDMARK', 'Gulshan 2', -0.001, 0.002],

    // Mohakhali
    ['Mohakhali bus stand', 'STAND', 'Mohakhali', 0.0, 0.001],
    ['Mohakhali Flyover mor', 'STAND', 'Mohakhali', -0.002, -0.001],
    ['Mohakhali DOHS gate', 'LANDMARK', 'Mohakhali', 0.003, 0.002],
    ['Mohakhali Wireless Gate', 'LANDMARK', 'Mohakhali', -0.001, 0.003],

    // Tejgaon
    ['Tejgaon Link Road stand', 'STAND', 'Tejgaon', 0.001, 0.0],
    ['Tejgaon Rail Gate stand', 'STAND', 'Tejgaon', -0.002, 0.002],
    ['Tejgaon Industrial Area', 'LANDMARK', 'Tejgaon', 0.002, -0.002],

    // Farmgate
    ['Farmgate overbridge stand', 'STAND', 'Farmgate', 0.0, 0.001],
    ['Farmgate Tejgaon College gate', 'STAND', 'Farmgate', -0.001, -0.001],
    ['Khejur Bagan', 'LANDMARK', 'Farmgate', 0.002, 0.002],

    // Dhanmondi
    ['Dhanmondi 27 stand', 'STAND', 'Dhanmondi', 0.001, 0.001],
    ['Dhanmondi 2 stand', 'STAND', 'Dhanmondi', -0.002, -0.001],
    ['Dhanmondi Lake', 'LANDMARK', 'Dhanmondi', 0.0, 0.003],
    ['Rabindra Sarobar', 'LANDMARK', 'Dhanmondi', -0.001, 0.002],

    // Mirpur
    ['Mirpur 10 Circle stand', 'STAND', 'Mirpur', 0.001, -0.001],
    ['Mirpur 1 stand', 'STAND', 'Mirpur', -0.003, 0.002],
    ['Mirpur 2 Zoo Road stand', 'STAND', 'Mirpur', 0.004, 0.001],
    ['Mirpur Stadium', 'LANDMARK', 'Mirpur', 0.0, 0.002],

    // Uttara — huge, three stands
    ['Uttara House Building stand', 'STAND', 'Uttara', 0.001, 0.001],
    ['Uttara Sector 7 stand', 'STAND', 'Uttara', -0.004, -0.002],
    ['Uttara Azampur stand', 'STAND', 'Uttara', 0.006, 0.002],
    ['Uttara Rajlokkhi', 'LANDMARK', 'Uttara', -0.002, 0.004],
    ['Uttara Diabari', 'LANDMARK', 'Uttara', 0.003, -0.003],

    // Bashundhara
    ['Bashundhara Gate 1 stand', 'STAND', 'Bashundhara', 0.001, 0.0],
    ['Bashundhara Gate 3 stand', 'STAND', 'Bashundhara', -0.002, 0.002],
    ['Bashundhara City Mall', 'LANDMARK', 'Bashundhara', 0.0, -0.002],

    // Badda
    ['Badda Link Road stand', 'STAND', 'Badda', 0.0, 0.001],
    ['Merul Badda stand', 'STAND', 'Badda', -0.001, -0.001],
    ['Rampura Bridge', 'LANDMARK', 'Badda', 0.002, 0.003],

    // Motijheel
    ['Arambagh mor stand', 'STAND', 'Motijheel', 0.001, -0.001],
    ['Motijheel Shapla Chottor stand', 'STAND', 'Motijheel', -0.001, 0.001],
    ['Bangladesh Bank', 'LANDMARK', 'Motijheel', 0.0, 0.002],
    ['Dilkusha', 'LANDMARK', 'Motijheel', 0.002, -0.001],
  ];

  return entries.map(([name, kind, zoneName, dLat, dLng]) => {
    const zone = z(zoneName);
    const { lat, lng } = near(zone, dLat, dLng);
    return { name, kind, zoneName, lat, lng };
  });
}
