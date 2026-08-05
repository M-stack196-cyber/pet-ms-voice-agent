const facilities = [
  {
    id: "dancing-creek-farm",
    name: "Dancing Creek Farm",
    currency: "USD",
    taxRate: 0.0825,
    depositRate: 0.3,
    petTypes: ["dog"],

    services: [
      {
        id: "short-term-boarding",
        name: "Short-Term Boarding",
        petType: "dog",
        minimumNights: 1,
        nightlyAdjustment: 0,
      },
      {
        id: "board-and-train",
        name: "Board and Train",
        petType: "dog",
        minimumNights: 7,
        nightlyAdjustment: 45,
      },
      {
        id: "long-term-boarding",
        name: "Long-Term Boarding",
        petType: "dog",
        minimumNights: 14,
        nightlyAdjustment: -5,
      },
    ],

    accommodations: [
      {
        id: "climate-controlled-cabin",
        name: "Climate-Controlled Cabin",
        petType: "dog",
        capacity: 4,
        baseNightlyRate: 55,
        additionalPetNightlyRate: 20,

        reservations: [
          {
            from: "2026-08-20",
            to: "2026-08-24",
            units: 2,
          },
        ],
      },
      {
        id: "large-cabin",
        name: "Large Cabin",
        petType: "dog",
        capacity: 3,
        baseNightlyRate: 72,
        additionalPetNightlyRate: 25,

        reservations: [
          {
            from: "2026-08-15",
            to: "2026-08-19",
            units: 1,
          },
        ],
      },
    ],
  },

  {
    id: "whisker-haven-cattery",
    name: "Whisker Haven Cattery",
    currency: "USD",
    taxRate: 0.0825,
    depositRate: 0.3,
    petTypes: ["cat"],

    services: [
      {
        id: "cat-boarding",
        name: "Cat Boarding",
        petType: "cat",
        minimumNights: 1,
        nightlyAdjustment: 0,
      },
      {
        id: "park-and-fly",
        name: "Park and Fly",
        petType: "cat",
        minimumNights: 2,
        nightlyAdjustment: 10,
      },
      {
        id: "grooming-stay",
        name: "Grooming Stay",
        petType: "cat",
        minimumNights: 1,
        nightlyAdjustment: 20,
      },
    ],

    accommodations: [
      {
        id: "cat-condo",
        name: "Cat Condo",
        petType: "cat",
        capacity: 5,
        baseNightlyRate: 40,
        additionalPetNightlyRate: 15,

        reservations: [
          {
            from: "2026-08-25",
            to: "2026-08-29",
            units: 2,
          },
        ],
      },
      {
        id: "luxury-suite",
        name: "Luxury Suite",
        petType: "cat",
        capacity: 2,
        baseNightlyRate: 65,
        additionalPetNightlyRate: 20,

        reservations: [],
      },
    ],
  },
];

module.exports = facilities;