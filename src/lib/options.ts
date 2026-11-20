/** Dropdown options — the same lists as dealer-portal (components/VehicleForm.tsx and lib/vehicle-options.ts). */

export const CONDITIONS = ['New', 'Used', 'Certified', 'Rebuilt', 'Salvage'];
export const VEHICLE_TYPES = ['Car', 'Truck', 'SUV', 'Van', 'Motorcycle', 'RV', 'Trailer'];
export const BODY_STYLES = ['SUV', 'Sedan', 'Pickup Truck', 'Hatchback', 'Coupe', 'Convertible', 'Wagon', 'Minivan', 'Van / Passenger Van', 'Cargo Van'];
export const DRIVETRAINS = ['2WD', '4WD', 'AWD', 'FWD', 'RWD'];
export const FUEL_TYPES = ['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'Natural Gas', 'E-85 / Gasoline', 'Gasoline / Natural Gas', 'Propane', 'Flex Fuel', 'Hydrogen', 'Plugin Hybrid'];
export const TRANSMISSIONS = [
  'Automatic', 'Manual', 'CVT', 'IVT',
  '4 Speed Automatic', '5 Speed Automatic', '6 Speed Automatic', '7 Speed Automatic', '8 Speed Automatic', '9 Speed Automatic', '10 Speed',
  '4 Speed Manual', '5 Speed Manual', '6 Speed Manual', '7 Speed Manual',
];
export const COLORS = [
  'Alum', 'Arctic Metallic', 'Beige', 'Black', 'Blue', 'Bronze', 'Brown', 'Burgundy', 'Champagne', 'Charcoal', 'Copper', 'Cream', 'Dark Blue', 'Dark Green',
  'Gold', 'Gray', 'Green', 'Light Blue', 'Light Green', 'Magnesium', 'Maroon', 'Matte Black', 'Orange', 'Pearl White', 'Pewter', 'Pink', 'Purple', 'Red',
  'Saddle', 'Sand', 'Silver', 'Spruce Green', 'Tan', 'Teal', 'White', 'Yellow',
];
export const CERTIFIED = ['Yes', 'No'];

/** Max text lengths accepted by the backend (backend/src/vehicles/vehicle.fields.ts → VEHICLE_TEXT). */
export const MAXLEN = {
  make: 60, model: 80, trim: 80, vehicleType: 40, bodyStyle: 40, condition: 20, stockNumber: 40, vin: 17,
  exteriorColor: 60, interiorColor: 60, engine: 80, drivetrain: 60, transmission: 60, fuelType: 40, description: 8000,
} as const;
