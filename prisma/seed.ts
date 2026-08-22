// npx tsx prisma/seed.ts
// Seeds ONE complete, demo-ready trip. Build every screen against this.
// Day 3 is deliberately broken — that is the money shot. Do not "fix" it here.

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const D = (d: string) => new Date(`${d}T00:00:00.000Z`);
const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=70`;

async function main() {
  await db.aiUsage.deleteMany(); await db.aiCache.deleteMany();
  await db.comment.deleteMany(); await db.photo.deleteMany();
  await db.expense.deleteMany(); await db.ingest.deleteMany();
  await db.candidate.deleteMany(); await db.block.deleteMany();
  await db.tripMember.deleteMany(); await db.trip.deleteMany(); await db.user.deleteMany();

  const people = [
    { id: "u_maya",   name: "Maya",   avatar: "M", diet: "veg" },
    { id: "u_ravi",   name: "Ravi",   avatar: "R", diet: "nonveg" },
    { id: "u_nikhil", name: "Nikhil", avatar: "N", diet: "veg" },
    { id: "u_ira",    name: "Ira",    avatar: "I", diet: "veg" },
    { id: "u_amma",   name: "Amma",   avatar: "A", diet: "veg" },
  ];
  for (const p of people) {
    await db.user.create({ data: {
      id: p.id, name: p.name, avatar: p.avatar,
      homeCity: "Bengaluru", homeLat: 12.9716, homeLng: 77.5946, homeCountry: "IN",
      profile: {
        interests: ["mountains", "nature", "food"],
        freeText: "First proper trip since Dad's surgery. Somewhere green and calm, nothing strenuous. Amma is 68 and the kids are 7 and 11.",
        tripStyle: "balanced", scope: "domestic",
        homeCity: "Bengaluru", homeCountry: "IN", homeLat: 12.9716, homeLng: 77.5946,
        transport: ["flight", "road"], stayTypes: ["homestay", "cabin"],
        budgetPerDay: 6000, currency: "INR",
      },
    } });
  }

  const trip = await db.trip.create({ data: {
    id: "trip_wayanad", title: "Wayanad — green and gentle",
    destination: "Wayanad, Kerala", destLat: 11.6854, destLng: 76.1320, destCountry: "IN",
    scope: "domestic", homeCountry: "IN", currency: "INR", homeCurrency: "INR",
    startDate: D("2026-09-07"), endDate: D("2026-09-12"),
    coverImage: IMG("1506905925346-21bda4d32df4"),
    status: "PLANNING", origin: "planned",
    inboundAddress: "trip-a7x2@in.wayfare.app",
    shareId: "x7fk2p9qm4vb3ncd8", shareLevel: "itinerary",
    party: { travellers: [
      { name: "Maya",   kind: "adult",  age: 38, diet: "veg", allergies: [] },
      { name: "Ravi",   kind: "adult",  age: 41, diet: "nonveg" },
      { name: "Nikhil", kind: "kid",    age: 11, diet: "veg" },
      { name: "Ira",    kind: "kid",    age: 7,  diet: "veg", allergies: ["nuts"] },
      { name: "Amma",   kind: "senior", age: 68, diet: "veg", mobility: "limited", health: ["knee"] },
    ] },
  } });
  for (const p of people) {
    await db.tripMember.create({ data: {
      tripId: trip.id, userId: p.id, role: p.id === "u_maya" ? "owner" : "member" } });
  }

  const H = {
    park:  { mon: ["07:30","16:00"], tue: ["07:30","16:00"], wed: ["07:30","16:00"],
             thu: ["07:30","16:00"], fri: ["07:30","16:00"], sat: ["07:30","16:00"], sun: ["07:30","16:00"] },
    safari:{ mon: ["06:00","10:00"], tue: ["06:00","10:00"], wed: ["06:00","10:00"],
             thu: ["06:00","10:00"], fri: ["06:00","10:00"], sat: ["06:00","10:00"], sun: ["06:00","10:00"] },
    caves: { tue: ["09:00","16:00"], wed: ["09:00","16:00"], thu: ["09:00","16:00"],
             fri: ["09:00","16:00"], sat: ["09:00","16:00"], sun: ["09:00","16:00"] },
    falls: { mon: ["09:00","17:00"], tue: ["09:00","17:00"], wed: ["09:00","17:00"],
             thu: ["09:00","17:00"], fri: ["09:00","17:00"], sat: ["09:00","17:00"], sun: ["09:00","17:00"] },
    uravu: { mon: ["09:30","17:00"], tue: ["09:30","17:00"], wed: ["09:30","17:00"],
             thu: ["09:30","17:00"], fri: ["09:30","17:00"], sat: ["09:30","17:00"] },
    food:  { mon: ["07:30","22:00"], tue: ["07:30","22:00"], wed: ["07:30","22:00"],
             thu: ["07:30","22:00"], fri: ["07:30","22:00"], sat: ["07:30","22:00"], sun: ["07:30","22:00"] },
  };

  type B = Parameters<typeof db.block.create>[0]["data"];
  const blocks: B[] = [
    // ---- Day 1, Mon 7 Sep — get there
    { tripId: trip.id, date: D("2026-09-07"), startTime: "06:40", endTime: "08:00", type: "FLIGHT",
      title: "IndiGo 6E-455 to Kozhikode", subtitle: "Bengaluru → CCJ · 5 seats",
      lat: 13.1986, lng: 77.7066, durationMin: 80, cost: 21050, currency: "INR", status: "CONFIRMED",
      meta: { confirmationNumber: "Q8K2LM", airline: "IndiGo", flightNumber: "6E-455",
              terminal: "T1", seats: "14A-14E", phone: "+911246173838" }, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-07"), startTime: "09:00", endTime: "11:00", type: "TRANSIT",
      title: "Drive to Vythiri", subtitle: "Ghat road — 2h, winding",
      lat: 11.5500, lng: 76.0400, durationMin: 120, cost: 3200, currency: "INR",
      tags: ["ghat"], meta: { notes: "Motion sickness tablets for the kids" }, sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-07"), startTime: "12:00", type: "LODGING",
      title: "Vythiri Tree Cabins", subtitle: "Check in · 5 nights",
      placeName: "Vythiri Tree Cabins", lat: 11.5500, lng: 76.0400,
      address: "Vythiri, Wayanad, Kerala 673576", cost: 36000, currency: "INR", status: "CONFIRMED",
      meta: { confirmationNumber: "VTC-3391", phone: "+914936266120", checkIn: "12:00",
              checkOut: "11:00", cancelBy: "2026-09-04", wifi: "TreeCabins_Guest / cabins2026",
              includedMeals: ["breakfast"], hostName: "Joseph" }, sortOrder: 3 },
    { tripId: trip.id, date: D("2026-09-07"), startTime: "19:30", endTime: "20:30", type: "MEAL",
      title: "Dinner at the cabins", subtitle: "Pure veg · included",
      lat: 11.5500, lng: 76.0400, durationMin: 60, openHours: H.food, sortOrder: 4 },

    // ---- Day 2, Tue 8 Sep — gentle
    { tripId: trip.id, date: D("2026-09-08"), startTime: "08:30", endTime: "09:15", type: "MEAL",
      title: "Breakfast", subtitle: "Included", lat: 11.5500, lng: 76.0400,
      durationMin: 45, openHours: H.food, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-08"), startTime: "10:30", endTime: "12:00", type: "ACTIVITY",
      title: "Pookode Lake loop", subtitle: "Flat 1 km walk · boats for the kids",
      placeName: "Pookode Lake", lat: 11.5361, lng: 76.0244, durationMin: 90, cost: 600,
      currency: "INR", tags: ["outdoor", "flat", "kid-friendly"], openHours: H.park, sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-08"), startTime: "13:00", endTime: "14:00", type: "MEAL",
      title: "Ente Adukkala, Kalpetta", subtitle: "Pure veg · family tables",
      lat: 11.6087, lng: 76.0837, durationMin: 60, cost: 1450, currency: "INR",
      tags: ["veg"], openHours: H.food, meta: { phone: "+914936202244" }, sortOrder: 3 },
    { tripId: trip.id, date: D("2026-09-08"), startTime: "16:00", endTime: "17:30", type: "ACTIVITY",
      title: "Tea estate walk", subtitle: "Short, flat, near the cabins",
      lat: 11.5480, lng: 76.0455, durationMin: 90, tags: ["outdoor", "flat"], sortOrder: 4 },

    // ---- Day 3, Wed 9 Sep — DELIBERATELY BROKEN. Do not fix.
    { tripId: trip.id, date: D("2026-09-09"), startTime: "06:00", endTime: "08:00", type: "ACTIVITY",
      title: "Jeep safari, Muthanga", subtitle: "Nilgiri tahr and elephants",
      placeName: "Muthanga Wildlife Sanctuary", lat: 11.6667, lng: 76.4167,
      durationMin: 120, cost: 2400, currency: "INR",
      tags: ["outdoor", "early"], openHours: H.safari, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-09"), startTime: "11:00", endTime: "13:35", type: "ACTIVITY",
      title: "Edakkal Caves", subtitle: "250 steps, steep climb",
      placeName: "Edakkal Caves", lat: 11.6244, lng: 76.2472, durationMin: 155,
      cost: 800, currency: "INR", tags: ["strenuous"], openHours: H.caves, sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-09"), startTime: "14:00", endTime: "16:00", type: "ACTIVITY",
      title: "Soochipara Falls", subtitle: "Wet rock — grippy shoes",
      placeName: "Soochipara Falls", lat: 11.4900, lng: 76.2100, durationMin: 120,
      cost: 900, currency: "INR", tags: ["outdoor"], openHours: H.falls, sortOrder: 3 },
    { tripId: trip.id, date: D("2026-09-09"), startTime: "17:30", endTime: "19:00", type: "ACTIVITY",
      title: "Uravu bamboo workshop", subtitle: "Indoors · kids can make something",
      placeName: "Uravu Bamboo Village", lat: 11.6087, lng: 76.0837, durationMin: 90,
      cost: 1200, currency: "INR", tags: ["indoor", "kid-friendly"], openHours: H.uravu, sortOrder: 4 },

    // ---- Day 4, Thu 10 Sep
    { tripId: trip.id, date: D("2026-09-10"), startTime: "09:00", endTime: "09:45", type: "MEAL",
      title: "Breakfast", lat: 11.5500, lng: 76.0400, durationMin: 45, openHours: H.food, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-10"), startTime: "11:00", endTime: "12:30", type: "ACTIVITY",
      title: "Banasura Sagar Dam", subtitle: "Earth dam · easy paths",
      lat: 11.6714, lng: 75.9200, durationMin: 90, cost: 700, currency: "INR",
      tags: ["outdoor", "flat"], openHours: H.park, sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-10"), startTime: "14:00", endTime: "15:00", type: "MEAL",
      title: "Lunch, Kalpetta", lat: 11.6087, lng: 76.0837, durationMin: 60,
      cost: 1600, currency: "INR", tags: ["veg"], openHours: H.food, sortOrder: 3 },

    // ---- Day 5, Fri 11 Sep — an empty afternoon on purpose
    { tripId: trip.id, date: D("2026-09-11"), startTime: "09:30", endTime: "10:15", type: "MEAL",
      title: "Breakfast", lat: 11.5500, lng: 76.0400, durationMin: 45, openHours: H.food, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-11"), startTime: "11:00", endTime: "12:30", type: "ACTIVITY",
      title: "Spice market, Kalpetta", subtitle: "Covered · Amma would like it",
      lat: 11.6087, lng: 76.0837, durationMin: 90, tags: ["indoor", "shopping"],
      openHours: H.food, sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-11"), startTime: "19:30", endTime: "20:30", type: "MEAL",
      title: "Dinner at the cabins", lat: 11.5500, lng: 76.0400, durationMin: 60,
      openHours: H.food, sortOrder: 3 },

    // ---- Day 6, Sat 12 Sep — home
    { tripId: trip.id, date: D("2026-09-12"), startTime: "11:00", endTime: "11:30", type: "LODGING",
      title: "Check out", lat: 11.5500, lng: 76.0400, durationMin: 30, sortOrder: 1 },
    { tripId: trip.id, date: D("2026-09-12"), startTime: "11:30", endTime: "13:30", type: "TRANSIT",
      title: "Drive to Kozhikode", lat: 11.1367, lng: 75.9553, durationMin: 120,
      cost: 3200, currency: "INR", sortOrder: 2 },
    { tripId: trip.id, date: D("2026-09-12"), startTime: "15:40", endTime: "17:00", type: "FLIGHT",
      title: "IndiGo 6E-456 to Bengaluru", lat: 11.1367, lng: 75.9553, durationMin: 80,
      status: "CONFIRMED", meta: { confirmationNumber: "Q8K2LM", flightNumber: "6E-456" }, sortOrder: 3 },
  ];
  for (const b of blocks) await db.block.create({ data: b });

  // Shortlist, with votes — feeds buildItinerary
  const cands = [
    { name: "Wayanad Wildlife Sanctuary", category: "activity", lat: 11.6667, lng: 76.4167,
      durationMin: 120, tags: ["outdoor","kid-friendly"], rating: 4.6, votes: ["u_maya","u_ravi","u_nikhil","u_ira"] },
    { name: "Pookode Lake", category: "activity", lat: 11.5361, lng: 76.0244, durationMin: 90,
      tags: ["flat","kid-friendly"], rating: 4.4, votes: ["u_maya","u_ravi","u_nikhil","u_ira","u_amma"], scheduled: true },
    { name: "Edakkal Caves", category: "activity", lat: 11.6244, lng: 76.2472, durationMin: 155,
      tags: ["strenuous","knee"], rating: 4.5, votes: ["u_ravi","u_nikhil"], scheduled: true },
    { name: "Chembra Peak trek", category: "activity", lat: 11.5089, lng: 76.1372, durationMin: 300,
      tags: ["strenuous","knee"], rating: 4.7, votes: ["u_ravi"] },
    { name: "Ente Adukkala", category: "restaurant", lat: 11.6087, lng: 76.0837, durationMin: 60,
      priceLevel: 2, tags: ["veg","family"], rating: 4.3, votes: ["u_maya","u_amma"], scheduled: true },
    { name: "Cashew Grove Café", category: "restaurant", lat: 11.6200, lng: 76.1000, durationMin: 60,
      priceLevel: 2, tags: ["nuts"], rating: 4.1, votes: [] },
    { name: "1980s Restaurant", category: "restaurant", lat: 11.6050, lng: 76.0800, durationMin: 75,
      priceLevel: 2, tags: ["veg","nostalgia"], rating: 4.4, votes: ["u_nikhil","u_ira"] },
    { name: "Uravu Bamboo Village", category: "activity", lat: 11.6087, lng: 76.0837, durationMin: 90,
      tags: ["indoor","kid-friendly"], rating: 4.2, votes: ["u_maya","u_ira"], scheduled: true },
  ];
  for (const c of cands) await db.candidate.create({ data: { tripId: trip.id, ...c } as any });

  // Money — 12 expenses that collapse to 4 payments (Maya is the only creditor,
  // so with 4 debtors the true minimum is 4 — do not chase "3")
  const ids = people.map((p) => p.id);
  const eq = (n: number) => Object.fromEntries(ids.map((i, k) =>
    [i, k === ids.length - 1 ? Math.round((n - Math.floor(n / ids.length * 100) / 100 * (ids.length - 1)) * 100) / 100
                             : Math.floor(n / ids.length * 100) / 100]));
  const spend: [string, number, string][] = [
    ["u_maya", 21050, "Flights"], ["u_maya", 36000, "Vythiri Tree Cabins"],
    ["u_ravi", 3200, "Airport transfer"], ["u_ravi", 2400, "Jeep safari"],
    ["u_maya", 1450, "Lunch, Ente Adukkala"], ["u_nikhil", 800, "Edakkal tickets"],
    ["u_ravi", 900, "Soochipara tickets"], ["u_amma", 1200, "Bamboo workshop"],
    ["u_nikhil", 600, "Pookode boats"], ["u_ravi", 1600, "Lunch, Kalpetta"],
    ["u_amma", 700, "Banasura tickets"], ["u_maya", 3200, "Return transfer"],
  ];
  for (const [payerId, amount, description] of spend) {
    await db.expense.create({ data: {
      tripId: trip.id, payerId, amount, description, currency: "INR",
      splitType: "equal", shares: eq(amount) } });
  }

  // Inbox — raw, unprocessed. Journey B demo lives here.
  await db.ingest.createMany({ data: [
    { tripId: trip.id, sourceType: "email", status: "pending", rawText:
`---------- Forwarded message ----------
From: reservations@vythiritreecabins.in
Subject: Booking confirmed — VTC-3391

Dear Maya, your reservation is confirmed.
  Check-in   07 Sep 2026, 12:00
  Check-out  12 Sep 2026, 11:00
  Rooms      2 x Family Cabin (sleeps 5)
  Total      INR 36,000
  Contact    +91 4936 266120
Free cancellation until 04 Sep 2026.` },
    { tripId: trip.id, sourceType: "text", status: "pending", rawText:
`Hi Maya — jeep confirmed for Wed 9th, 6am sharp at Muthanga gate.
Bring printed ID for the permit. 2400 for the vehicle. — Shaji, 9847112233` },
  ] });

  console.log("Seeded: 1 trip, 5 travellers, 21 blocks, 8 candidates, 12 expenses, 2 pending ingests.");
  console.log("Day 3 (Wed 9 Sep) is deliberately broken — 2 errors, 3 warnings.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
