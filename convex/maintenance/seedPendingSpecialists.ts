import { internalMutation } from "../_generated/server";

export const seedPendingSpecialists = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const fixtures = [
      {
        name: "Dra. Elena Ficticia",
        email: "pending1@test.sephiem.com",
        walletAddress: "0x00000000000000000000000000000000000000e1",
        licenseNumber: "LIC-PEND-001",
        jurisdiction: "Lima, PE",
        specialty: "Neurologia",
        description: "Especialista ficticia pendiente (smoke test VAL-61).",
        consultationFeeSYS: "25.00",
        yearsOfExperience: 10,
      },
      {
        name: "Dr. Marco Ficticio",
        email: "pending2@test.sephiem.com",
        walletAddress: "0x00000000000000000000000000000000000000e2",
        licenseNumber: "LIC-PEND-002",
        jurisdiction: "Arequipa, PE",
        specialty: "Endocrinologia",
        description: "Especialista ficticio pendiente (smoke test VAL-61).",
        consultationFeeSYS: "30.00",
        yearsOfExperience: 7,
      },
      {
        name: "Dra. Lucia Ficticia",
        email: "pending3@test.sephiem.com",
        walletAddress: "0x00000000000000000000000000000000000000e3",
        licenseNumber: "LIC-PEND-003",
        jurisdiction: "Cusco, PE",
        specialty: "Oftalmologia",
        description: "Especialista ficticia pendiente (smoke test VAL-61).",
        consultationFeeSYS: "18.00",
        yearsOfExperience: 4,
      },
    ];

    const existing = await ctx.db.query("marketplaceSpecialists").collect();
    const existingWallets = new Set(existing.map((s) => s.walletAddress));

    let created = 0;
    for (const f of fixtures) {
      if (existingWallets.has(f.walletAddress)) continue;

      const profileId = await ctx.db.insert("profiles", {
        tokenIdentifier: `seed-pending|${f.walletAddress}`,
        walletAddress: f.walletAddress,
        role: "patient",
        name: f.name,
        email: f.email,
        isActive: true,
      });

      await ctx.db.insert("marketplaceSpecialists", {
        profileId,
        licenseNumber: f.licenseNumber,
        jurisdiction: f.jurisdiction,
        walletAddress: f.walletAddress,
        isVerifiedByAdmin: false,
        specialty: f.specialty,
        description: f.description,
        consultationFeeSYS: f.consultationFeeSYS,
        yearsOfExperience: f.yearsOfExperience,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created, totalFixtures: fixtures.length };
  },
});
